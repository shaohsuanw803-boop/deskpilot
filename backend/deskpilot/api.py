"""Local-only HTTP application; demonstration identities are not enterprise SSO."""
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .db import Store, new_id
from .knowledge import KnowledgeService
from .http_boundary import RequestBoundaryMiddleware
from .localization import error_text, request_locale, skill_display, system_text
from .policy import USERS, PolicyError, User, own_or_staff, redact, require_role
from .workflow import DeskService, IdempotencyConflict


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Profile(Input):
    user_id: str


class RunInput(Input):
    message: str = Field(min_length=1, max_length=8000)
    thread_id: str | None = None
    ticket_id: str | None = None
    cloud_allowed: bool = True
    mcp_server: Literal['demo-it', 'enterprise-it'] | None = None
    locale: Literal['en', 'zh-CN'] | None = None


class MCPCall(Input):
    tool: Literal['service_status', 'asset_lookup']
    arguments: dict = Field(default_factory=dict)


class TicketInput(Input):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=8000)
    run_id: str | None = None
    cloud_allowed: bool = True


class Resolution(Input):
    resolution: str = Field(min_length=1, max_length=8000)


class Decision(Input):
    decision: Literal['approve', 'reject']


class Version(Input):
    version: str


class Memory(Input):
    text: str = Field(min_length=1, max_length=500)
    confirmed: bool = False


class Search(Input):
    query: str = Field(min_length=1, max_length=8000)
    strategy: Literal['default', 'bm25', 'dense', 'hybrid', 'hybrid_rerank'] = 'default'


def seed_knowledge(store, settings):
    """Seed local excerpts only. Cloud indexing is an explicit, budgeted CLI operation."""
    marker = store.get('meta', 'seeded')
    catalog = settings.repo_root / 'fixtures' / 'knowledge' / 'catalog.json'
    if marker or not catalog.exists():
        return
    local = KnowledgeService(store, settings.model_copy(update={'app_mode': 'demo'}))
    try:
        for item in json.loads(catalog.read_text(encoding='utf-8')):
            if store.get('document', item['id']):
                continue
            content = (catalog.parent / item['file']).read_bytes()
            doc = local.ingest(item['file'], content, item, USERS['admin'], document_id=item['id'])
            if doc.get('pending_state') == 'prepared':
                local.publish(doc['id'], USERS['admin'])
        store.put('meta', {'id': 'seeded', 'corpus': 'fictional-v1'})
    finally:
        local.close()


def create_app(settings=None, seed=True):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        store = Store(settings.data_dir / 'deskpilot.sqlite')
        if seed:
            seed_knowledge(store, settings)
        knowledge = KnowledgeService(store, settings)
        service = DeskService(store, settings, knowledge)
        app.state.store, app.state.knowledge, app.state.service = store, knowledge, service
        service.recover()
        try:
            yield
        finally:
            service.close()
            knowledge.close()
            store.close()

    app = FastAPI(title='DeskPilot API', version='0.1.0', lifespan=lifespan,
                  description='Local enterprise IT helpdesk. Demo identities, real RAG and resumable approvals.')
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])

    @app.middleware('http')
    async def local_origin(request, call_next):
        origin = request.headers.get('origin')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin:
            if origin not in (str(request.base_url).rstrip('/'), 'http://localhost:5173', 'http://127.0.0.1:5173',
                              'http://localhost:8000', 'http://127.0.0.1:8000', 'http://testserver'):
                return JSONResponse({'detail': system_text('不接受来自其他站点的写入请求。', request_locale(request.headers.get('accept-language')))}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        if request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    app.add_middleware(RequestBoundaryMiddleware,
                       max_body_bytes=settings.http_max_body_bytes,
                       max_upload_bytes=settings.http_max_upload_bytes,
                       max_concurrent_requests=settings.http_max_concurrent_requests,
                       body_timeout_seconds=settings.http_body_timeout_seconds)

    @app.exception_handler(IdempotencyConflict)
    async def idempotency_exception(request, exc):
        detail = ('该提交标识已绑定其他任务，或对应任务已不可用。'
                  if request_locale(request.headers.get('accept-language')) == 'zh-CN'
                  else 'This request key is bound to a different or unavailable task.')
        return JSONResponse({'detail': detail}, status_code=409)

    @app.exception_handler(PolicyError)
    async def policy_exception(request, exc):
        return JSONResponse({'detail': error_text(str(redact(str(exc))), request_locale(request.headers.get('accept-language')))}, status_code=403)

    @app.exception_handler(ValueError)
    async def value_exception(request, exc):
        return JSONResponse({'detail': error_text(str(redact(str(exc))), request_locale(request.headers.get('accept-language')))}, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_exception(request, exc):
        locale = request_locale(request.headers.get('accept-language'))
        return JSONResponse({'detail': system_text(str(exc.detail), locale)}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception(request, exc):
        locale = request_locale(request.headers.get('accept-language'))
        # Pydantic's input and context may contain secrets. Return only safe field paths and codes.
        known_fields = {'body', 'query', 'path', 'header'} | {
            field for model in (Profile, RunInput, MCPCall, TicketInput, Resolution, Decision, Version, Memory, Search)
            for field in model.model_fields}
        details = [{'loc': [part if isinstance(part, int) or part in known_fields else 'field' for part in error['loc']], 'type': error['type'],
                    'msg': '字段值无效或缺少必填字段。' if locale == 'zh-CN' else 'Invalid value or missing required field.'}
                   for error in exc.errors()]
        return JSONResponse({'detail': details}, status_code=422)

    def current_user(request: Request):
        session = request.app.state.store.get('session', request.cookies.get('deskpilot_session', ''))
        if not session or datetime.fromisoformat(session['expires_at']) <= datetime.now(timezone.utc):
            raise HTTPException(401, '请先在演示身份选择器中选择身份。')
        return USERS[session['user_id']]

    def set_session(response, user_id):
        token = secrets.token_urlsafe(32)
        app.state.store.put('session', {'id': token, 'user_id': user_id,
            'expires_at': (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()})
        response.set_cookie('deskpilot_session', token, httponly=True, samesite='strict', max_age=604800)

    def config_status(locale='en'):
        missing = settings.cloud_missing()
        return {'mode': settings.app_mode, 'cloud_ready': not missing, 'missing': missing,
                'models': {'chat': settings.llm_model, 'embedding': settings.embedding_model,
                           'rerank': settings.rerank_model},
                'capabilities': (['真实中文 BM25 检索', '版本与权限过滤', '持久化工单与审批',
                                 '来源引用与撤回检查', '云端适配器（需配置）'] if locale == 'zh-CN' else
                                 ['Real BM25 retrieval with reviewed bilingual aliases', 'Version and access filtering',
                                  'Persistent tickets and approvals', 'Citations and source revocation checks', 'Cloud adapters (configuration required)']),
                'budgets': {'per_run_cny': settings.max_run_cost_cny, 'daily_cny': settings.max_daily_cost_cny},
                'identity_mode': 'local_demo', 'price_as_of': settings.price_as_of}

    def find(kind, object_id):
        item = app.state.store.get(kind, object_id)
        if not item:
            raise HTTPException(404, '记录不存在。')
        return item

    def visible_run(run, user):
        own_or_staff(user, run)
        value = dict(run)
        invalid = False
        for citation in value.get('citations', []):
            try:
                app.state.knowledge.get_source(citation['id'], user)
            except (ValueError, KeyError):
                invalid = True
        retrieval = json.loads(json.dumps(value.get('retrieval', {})))
        for key in ('evidence', 'adjacent_context'):
            for chunk in retrieval.get(key, []):
                try:
                    app.state.knowledge.get_source(chunk['id'], user)
                except (ValueError, KeyError):
                    invalid = True
        for ref in value.get('memory_refs', []):
            memory = app.state.store.get('memory', ref['id'])
            if not memory or memory.get('deleted') or memory['revision'] != ref['revision']:
                invalid = True
        if invalid:
            value.update(answer=system_text('此回答依赖的来源或偏好已变化，或当前身份无权查看，请重新检索。', value.get('locale', 'zh-CN')),
                         citations=[], retrieval={}, source_invalidated=True)
        elif retrieval:
            app.state.knowledge._sanitize_trace(retrieval.setdefault('trace', {}), user)
            value['retrieval'] = retrieval
        return redact(value)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'app': 'DeskPilot', 'mode': settings.app_mode}

    @app.post('/api/session')
    def session(body: Profile, response: Response):
        if body.user_id not in USERS:
            raise HTTPException(400, '未知演示身份。')
        set_session(response, body.user_id)
        return {'user': USERS[body.user_id].as_dict()}

    @app.get('/api/bootstrap')
    def bootstrap(request: Request, response: Response):
        try:
            user = current_user(request)
        except HTTPException:
            user = USERS['alice']
            set_session(response, user.id)
        store = app.state.store
        staff = user.role in ('it', 'admin')
        return {'mode': settings.app_mode, 'user': user.as_dict(), 'users': [u.as_dict() for u in USERS.values()],
                'summary': {'documents': len(app.state.knowledge.list_documents(user)),
                            'runs': len([r for r in store.list('run') if staff or r['user_id'] == user.id]),
                            'tickets': len([t for t in store.list('ticket') if staff or t['owner_id'] == user.id]),
                            'approvals': len([a for a in store.list('approval') if a['status'] == 'pending'
                                              and (staff or a['requester_id'] == user.id)])},
                'locale': request_locale(request.headers.get('accept-language')),
                'config': config_status(request_locale(request.headers.get('accept-language')))}

    @app.get('/api/config/status')
    def status(request: Request, user: User = Depends(current_user)):
        return config_status(request_locale(request.headers.get('accept-language')))

    @app.post('/api/config/check')
    def check(request: Request, user: User = Depends(current_user)):
        require_role(user, 'admin')
        if settings.app_mode != 'cloud' or settings.cloud_missing():
            return {'ok': False, 'missing': settings.cloud_missing(),
                    'message': system_text('当前未启用完整云端配置，未发出任何外部请求。', request_locale(request.headers.get('accept-language')))}
        return app.state.knowledge.providers.connectivity_check()

    @app.post('/api/runs')
    def run(body: RunInput, request: Request, user: User = Depends(current_user),
            idempotency_key: str | None = Header(default=None, alias='Idempotency-Key',
                                                min_length=1, max_length=128, pattern=r'^[!-~]+$')):
        parameters = body.model_dump()
        parameters['locale'] = body.locale or request_locale(request.headers.get('accept-language'))
        result = app.state.service.run(user, **parameters, idempotency_key=idempotency_key)
        app.state.store.audit(user.id, 'run.request', result['id'],
                              {'request_id': request.state.request_id})
        return visible_run(result, user)

    @app.get('/api/runs')
    def runs(user: User = Depends(current_user)):
        return {'items': [visible_run(r, user) for r in reversed(app.state.store.list('run'))
                          if user.role in ('it', 'admin') or r['user_id'] == user.id]}

    @app.get('/api/runs/{run_id}')
    def get_run(run_id: str, user: User = Depends(current_user)):
        return visible_run(find('run', run_id), user)

    @app.get('/api/runs/{run_id}/events')
    def events(run_id: str, request: Request, user: User = Depends(current_user)):
        run = visible_run(find('run', run_id), user)
        try:
            last_id = int(request.headers.get('last-event-id', '0'))
        except ValueError:
            last_id = 0
        def stream():
            for event in run.get('events', []):
                if event['id'] > last_id:
                    yield f"id: {event['id']}\nevent: step\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield f"event: status\ndata: {json.dumps({'status': run['status']})}\n\n"
        return StreamingResponse(stream(), media_type='text/event-stream')

    @app.get('/api/approvals')
    def approvals(user: User = Depends(current_user)):
        return {'items': [redact(a) for a in app.state.store.list('approval')
                          if user.role in ('it', 'admin') or a['requester_id'] == user.id]}

    @app.post('/api/approvals/{approval_id}/decision')
    def decide(approval_id: str, body: Decision, user: User = Depends(current_user)):
        return app.state.service.decide(user, approval_id, body.decision)

    @app.get('/api/tickets')
    def tickets(user: User = Depends(current_user)):
        return {'items': [redact(t) for t in app.state.store.list('ticket')
                          if user.role in ('it', 'admin') or t['owner_id'] == user.id]}

    @app.post('/api/tickets')
    def create_ticket(body: TicketInput, user: User = Depends(current_user)):
        service, store = app.state.service, app.state.store
        skill = service.skills.get('diagnose')
        service.skills.guard(user, 'diagnose', skill['version'], 'ticket.create')
        with store.transaction():
            source_refs = []
            cloud_allowed = body.cloud_allowed
            if body.run_id:
                run = find('run', body.run_id)
                own_or_staff(user, run)
                source_refs = [c['id'] for c in run.get('citations', [])]
                cloud_allowed = cloud_allowed and run.get('cloud_allowed', True)
                for source_id in source_refs:
                    try:
                        source = app.state.knowledge.get_source(source_id, user)
                        cloud_allowed = cloud_allowed and source.get('cloud_allowed', False)
                    except ValueError:
                        cloud_allowed = False
                existing = [t for t in store.list('ticket') if t.get('run_id') == body.run_id and t['owner_id'] == user.id]
                if existing:
                    return existing[0]
            ticket = store.put('ticket', {**body.model_dump(), 'id': new_id('TKT'), 'owner_id': user.id,
                                         'status': 'open', 'cloud_allowed': cloud_allowed, 'source_refs': source_refs})
            store.audit(user.id, 'ticket.create', ticket['id'])
        return redact(ticket)

    @app.post('/api/tickets/{ticket_id}/resolve')
    def resolve(ticket_id: str, body: Resolution, user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        ticket = find('ticket', ticket_id)
        with app.state.store.transaction():
            ticket = app.state.store.put('ticket', {**ticket, 'status': 'resolved', 'resolution': body.resolution})
            app.state.store.audit(user.id, 'ticket.resolve', ticket_id)
        return redact(ticket)

    @app.post('/api/tickets/{ticket_id}/knowledge')
    def promote(ticket_id: str, request: Request, user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        ticket = find('ticket', ticket_id)
        if ticket['status'] != 'resolved':
            raise ValueError('请先解决工单并填写解决方法。')
        if ticket.get('knowledge_id'):
            return find('document', ticket['knowledge_id'])
        package = app.state.service.skills.get('ticket-summary')
        app.state.service.skills.guard(user, 'ticket-summary', package['version'], 'ticket.summarize')
        text = f"# {ticket['title']}\n\n来源工单：{ticket_id}\n\n## 问题\n{ticket['description']}\n\n## 经人工确认的解决方法\n{ticket['resolution']}\n"
        if request_locale(request.headers.get('accept-language')) == 'en':
            text = f"# {ticket['title']}\n\nSource ticket: {ticket_id}\n\n## Issue\n{ticket['description']}\n\n## Human-confirmed resolution\n{ticket['resolution']}\n"
        metadata = {'title': ticket['title'], 'source_ticket_id': ticket_id, 'owner': user.name,
                    'roles': ['it', 'admin'], 'cloud_allowed': False}
        doc = app.state.knowledge.ingest(f'{ticket_id}.md', text.encode(), metadata, user)
        app.state.store.put('ticket', {**ticket, 'knowledge_id': doc['id']})
        return doc

    @app.get('/api/knowledge')
    def knowledge(user: User = Depends(current_user)):
        return {'items': app.state.knowledge.list_documents(user)}

    @app.post('/api/knowledge')
    def ingest(file: UploadFile = File(...), metadata: str = Form('{}'), user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        content = file.file.read(20 * 1024 * 1024 + 1)
        info = json.loads(metadata)
        if not isinstance(info, dict):
            raise ValueError('metadata 必须是 JSON 对象。')
        return app.state.knowledge.ingest(file.filename or 'document.txt', content, info, user)

    @app.post('/api/knowledge/{document_id}/versions')
    def add_version(document_id: str, file: UploadFile = File(...), metadata: str = Form('{}'),
                    user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        find('document', document_id)
        info = json.loads(metadata)
        if not isinstance(info, dict):
            raise ValueError('metadata 必须是 JSON 对象。')
        return app.state.knowledge.ingest(file.filename or 'document.txt', file.file.read(20 * 1024 * 1024 + 1),
                                        info, user, document_id=document_id)

    @app.get('/api/knowledge/{document_id}/preview')
    def preview(document_id: str, user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        store = app.state.store
        with store.transaction():
            doc = find('document', document_id)
            version = find('document_version', f"{document_id}:v{doc['version']}")
            chunks = sorted([c for c in store.list('chunk') if c['document_id'] == document_id
                             and c['version'] == version['version']], key=lambda c: c['ordinal'])
            return {'document_id': document_id, 'version': version['version'], 'state': version['state'],
                    'metadata': version['metadata'], 'chunks': chunks}

    @app.post('/api/knowledge/{document_id}/publish')
    def publish(document_id: str, user: User = Depends(current_user)):
        return app.state.knowledge.publish(document_id, user)

    @app.post('/api/knowledge/{document_id}/withdraw')
    def withdraw(document_id: str, user: User = Depends(current_user)):
        return app.state.knowledge.withdraw(document_id, user)

    @app.get('/api/knowledge/jobs')
    def jobs(user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        return {'items': [{k: v for k, v in j.items() if k != 'content_b64'}
                          for j in app.state.store.list('ingestion_job')]}

    @app.post('/api/knowledge/jobs/{job_id}/retry')
    def retry(job_id: str, user: User = Depends(current_user)):
        result = app.state.knowledge.retry(job_id, user)
        return {k: v for k, v in result.items() if k != 'content_b64'}

    @app.get('/api/sources/{chunk_id}')
    def source(chunk_id: str, user: User = Depends(current_user)):
        return app.state.knowledge.get_source(chunk_id, user)

    @app.post('/api/retrieval/inspect')
    def inspect(body: Search, request: Request, user: User = Depends(current_user)):
        return app.state.knowledge.search(body.query, user, run_id=new_id('inspect'), strategy=body.strategy,
                                         context={'locale': request_locale(request.headers.get('accept-language'))})

    @app.get('/api/connectors')
    def connectors(request: Request, user: User = Depends(current_user)):
        locale = request_locale(request.headers.get('accept-language'))
        names = {'demo-it': 'Local IT demo', 'enterprise-it': 'Enterprise IT connector'}
        return {'items': [{**item, 'display_name': names[item['id']] if locale == 'en' else item['name']}
                          for item in app.state.service.harness.catalog()]}

    @app.post('/api/connectors/{server_id}/call')
    def connector_call(server_id: str, body: MCPCall, user: User = Depends(current_user)):
        return app.state.service.harness.call(user, server_id, body.tool, body.arguments)

    @app.post('/api/connectors/{server_id}/reset')
    def connector_reset(server_id: str, user: User = Depends(current_user)):
        app.state.service.harness.reset(user, server_id)
        return {'ok': True}

    @app.get('/api/tool-calls')
    def tool_calls(user: User = Depends(current_user)):
        return {'items': app.state.service.harness.records(user)}

    @app.get('/api/skills')
    def skills(request: Request, user: User = Depends(current_user)):
        locale = request_locale(request.headers.get('accept-language'))
        return {'items': [skill_display(item, locale) for item in app.state.service.skills.list()]}

    @app.post('/api/skills/{skill_id}/evaluate')
    def evaluate(skill_id: str, body: Version, user: User = Depends(current_user)):
        return app.state.service.skills.evaluate(user, skill_id, body.version, app.state.knowledge)

    @app.post('/api/skills/{skill_id}/activate')
    def activate(skill_id: str, body: Version, user: User = Depends(current_user)):
        return app.state.service.skills.activate(user, skill_id, body.version)

    @app.get('/api/memories')
    def memories(user: User = Depends(current_user)):
        return {'items': app.state.service.memories(user)}

    @app.post('/api/memories')
    def remember(body: Memory, user: User = Depends(current_user)):
        return app.state.service.save_memory(user, body.text, body.confirmed)

    @app.patch('/api/memories/{memory_id}')
    def update_memory(memory_id: str, body: Memory, user: User = Depends(current_user)):
        return app.state.service.save_memory(user, body.text, body.confirmed, memory_id)

    @app.delete('/api/memories/{memory_id}')
    def forget(memory_id: str, user: User = Depends(current_user)):
        app.state.service.delete_memory(user, memory_id)
        return {'deleted': True}

    @app.get('/api/operations')
    def operations(request: Request, user: User = Depends(current_user)):
        require_role(user, 'it', 'admin')
        store = app.state.store
        usage = store.list('usage')
        run_list = store.list('run')
        evaluations = store.list('evaluation') + store.list('skill_evaluation')
        for name in ('retrieval-baseline', 'retrieval-heldout'):
            report_path = settings.repo_root / 'docs' / 'reports' / f'{name}.json'
            if report_path.exists():
                try:
                    report = json.loads(report_path.read_text(encoding='utf-8'))
                    label = '检索评测' if request_locale(request.headers.get('accept-language')) == 'zh-CN' else 'Retrieval evaluation'
                    evaluations.append({'name': f"{label} · {report.get('split', name)}",
                                        **{k: v for k, v in report.items() if k != 'results'}})
                except (ValueError, OSError):
                    pass
        return {'runs': [visible_run(r, user) for r in reversed(run_list)], 'usage': usage,
                'audit': list(reversed(store.list('audit')))[0:300], 'evaluations': evaluations,
                'totals': {'runs': len(run_list), 'completed': sum(r['status'] == 'completed' for r in run_list),
                           'actual_cost_cny': sum(u.get('actual_cny') or 0 for u in usage),
                           'reserved_cost_cny': sum(u.get('charged_cny', 0) for u in usage),
                           'unknown_usage': sum(u.get('usage_status') in ('unknown', 'reserved') for u in usage),
                           'input_tokens': sum(u.get('input_tokens') or 0 for u in usage),
                           'output_tokens': sum(u.get('output_tokens') or 0 for u in usage),
                           'mode': settings.app_mode}}

    @app.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        if path.startswith('api/'):
            raise HTTPException(404)
        dist = settings.repo_root / 'frontend' / 'dist'
        candidate = (dist / path).resolve()
        if candidate.is_relative_to(dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        if (dist / 'index.html').exists():
            return FileResponse(dist / 'index.html')
        return JSONResponse({'app': 'DeskPilot', 'message': 'For frontend development, open http://localhost:5173', 'api_docs': '/docs'})

    return app


app = create_app()
