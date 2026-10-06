"""Durable, bounded workflows and exactly-once local simulated business effects."""
import hashlib
import json
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from typing import TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from .db import new_id, now
from .localization import error_text, system_text
from .policy import POLICY_VERSION, USERS, PolicyError, check_outbound, own_or_staff, redact, require_role
from .skills import SkillRegistry


class RunState(TypedDict, total=False):
    run_id: str
    user_id: str
    message: str
    thread_id: str
    ticket_id: str | None
    cloud_allowed: bool
    mcp_server: str | None
    locale: str
    diagnostics: list
    route: str
    skill_id: str
    skill_version: str
    approval_id: str
    decision: str
    answer: str
    citations: list
    retrieval: dict
    status: str


def approval_digest(item):
    fields = ('requester_id', 'tool', 'parameters', 'skill_id', 'skill_version', 'skill_digest',
              'policy_version', 'run_id', 'expires_at')
    value = {key: item[key] for key in fields}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class DeskService:
    def __init__(self, store, settings, knowledge):
        self.store, self.settings, self.knowledge = store, settings, knowledge
        self.skills = SkillRegistry(store, settings)
        from .harness import ToolHarness
        self.harness = ToolHarness(store, settings)
        self.lock = threading.RLock()
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_conn = sqlite3.connect(settings.data_dir / 'checkpoints.sqlite', check_same_thread=False)
        self.checkpointer = SqliteSaver(self.checkpoint_conn)
        builder = StateGraph(RunState)
        builder.add_node('route', self._route)
        builder.add_node('retrieve', self._retrieve)
        builder.add_node('preflight', self._preflight)
        builder.add_node('prepare_approval', self._prepare_approval)
        builder.add_node('approval', self._approval)
        builder.add_node('execute', self._execute)
        builder.add_edge(START, 'route')
        builder.add_conditional_edges('route', lambda state: state['route'],
                                      {'diagnose': 'preflight', 'access': 'prepare_approval'})
        builder.add_edge('preflight', 'retrieve')
        builder.add_edge('retrieve', END)
        builder.add_edge('prepare_approval', 'approval')
        builder.add_edge('approval', 'execute')
        builder.add_edge('execute', END)
        self.graph = builder.compile(checkpointer=self.checkpointer)
        self._closed = False

    def _config(self, run_id):
        return {'configurable': {'thread_id': run_id}, 'recursion_limit': 16}

    def _event(self, run_id, stage, detail):
        with self.store.transaction():
            run = self.store.get('run', run_id)
            events = run.setdefault('events', [])
            if isinstance(detail, str):
                detail = system_text(detail, run.get('locale', 'zh-CN'))
            events.append({'id': len(events) + 1, 'stage': stage, 'detail': redact(detail), 'at': now()})
            self.store.put('run', run)

    def _tool(self, state, tool, actor=None):
        user = actor or USERS[state['user_id']]
        self.skills.guard(user, state['skill_id'], state['skill_version'], tool)
        with self.store.transaction():
            run = self.store.get('run', state['run_id'])
            if run.get('steps', 0) >= self.settings.max_agent_steps:
                raise PolicyError('已达到本次任务工具步骤上限，请交由人工继续处理。')
            run['steps'] = run.get('steps', 0) + 1
            self.store.put('run', run)
            self.store.audit(user.id, 'tool.allow', state['run_id'], {
                'tool': tool, 'skill': state['skill_id'], 'version': state['skill_version'],
                'policy_version': POLICY_VERSION})

    def _route(self, state):
        access = bool(re.search(
            r'(申请|开通|获取).{0,18}(权限|许可|账号)|软件申请|'
            r'\b(?:request|need|apply\s+for)\b.{0,60}\b(?:access|permission|license|licence|account)\b',
            state['message'], re.I))
        skill_id = 'access-request' if access else ('diagnose-connected' if state.get('mcp_server') else 'diagnose')
        package = self.skills.get(skill_id)
        run = self.store.get('run', state['run_id'])
        self.store.put('run', {**run, 'skill_id': skill_id, 'skill_version': package['version'],
                               'skill_digest': package['digest'],
                               'deadline_at': (datetime.now(timezone.utc) + timedelta(
                                   seconds=package['timeout_seconds'])).isoformat()})
        self._event(state['run_id'], 'route', '识别为软件权限申请' if access else '检索适用知识与排查依据')
        return {'route': 'access' if access else 'diagnose', 'skill_id': skill_id,
                'skill_version': package['version']}

    def _context_run_valid(self, run, user):
        if not run or not run.get('cloud_allowed', True):
            return False
        try:
            check_outbound([run['message'], run.get('answer', '')])
            for citation in run.get('citations', []):
                if not self.knowledge.get_source(citation['id'], user).get('cloud_allowed', False):
                    return False
            for ref in run.get('memory_refs', []):
                memory = self.store.get('memory', ref['id'])
                if not memory or memory.get('deleted') or memory['revision'] != ref['revision']:
                    return False
        except (PolicyError, ValueError, KeyError):
            return False
        return True

    def _context(self, state):
        user = USERS[state['user_id']]
        messages = []
        dependencies = {'source_ids': [], 'memory_refs': [], 'run_refs': [], 'ticket_refs': []}

        def depend_on_run(run):
            dependencies['source_ids'].extend(c['id'] for c in run.get('citations', []))
            dependencies['memory_refs'].extend(run.get('memory_refs', []))
            dependencies['run_refs'].append({'id': run['id'], 'updated_at': run['updated_at']})

        # Reconstruct from authorized sources every time; checkpoint text is never used as chat history.
        previous = [r for r in self.store.list('run') if r['thread_id'] == state['thread_id']
                    and r['user_id'] == user.id and r['id'] != state['run_id']][-4:]
        for run in previous:
            if not self._context_run_valid(run, user):
                continue
            depend_on_run(run)
            for role, text in [('user', run['message']), ('assistant', run.get('answer', ''))]:
                try:
                    check_outbound([text])
                except PolicyError:
                    continue
                messages.append({'role': role, 'content': text[:1800]})
        task = {}
        thread = self.store.get('thread', state['thread_id']) or {}
        initial = self.store.get('run', thread.get('initial_run_id', ''))
        if initial and initial['id'] != state['run_id'] and self._context_run_valid(initial, user):
            task['initial_request'] = initial['message'][:1000]
            depend_on_run(initial)
        progress = [self.store.get('run', ref) for ref in thread.get('progress_run_ids', [])]
        progress = [r for r in progress if r and r['id'] != state['run_id'] and self._context_run_valid(r, user)]
        task['reported_progress'] = [r['message'][:500] for r in progress]
        for run in progress:
            depend_on_run(run)
        if state.get('ticket_id'):
            ticket = self.store.get('ticket', state['ticket_id'])
            own_or_staff(user, ticket, 'owner_id')
            source_valid = True
            for source_id in ticket.get('source_refs', []):
                try:
                    source = self.knowledge.get_source(source_id, user)
                    if not source.get('cloud_allowed'):
                        source_valid = False
                except (PolicyError, ValueError, KeyError):
                    source_valid = False
            if ticket.get('cloud_allowed', True) and source_valid:
                dependencies['source_ids'].extend(ticket.get('source_refs', []))
                dependencies['ticket_refs'].append({'id': ticket['id'], 'updated_at': ticket['updated_at']})
                task.update({key: ticket.get(key) for key in ('id', 'title', 'description', 'status', 'resolution')})
                try:
                    check_outbound([json.dumps(task, ensure_ascii=False)])
                except PolicyError:
                    task = {'id': ticket['id'], 'status': ticket['status']}
        preferences = []
        for memory in self.memories(user)[-3:]:
            try:
                check_outbound([memory['text']])
                preferences.append(memory['text'])
                dependencies['memory_refs'].append({'id': memory['id'], 'revision': memory['revision']})
            except PolicyError:
                continue
        package = self.skills.get(state['skill_id'], state['skill_version'])
        dependencies['source_ids'] = list(set(dependencies['source_ids']))
        return {'messages': messages, 'task': task, 'preferences': preferences, 'dependencies': dependencies,
                'skill': {'id': package['id'], 'version': package['version'],
                          'instructions': package['instructions']},
                'cloud_allowed': state.get('cloud_allowed', True), 'locale': state.get('locale', 'zh-CN')}

    def _preflight(self, state):
        server = state.get('mcp_server')
        if not server:
            return {'diagnostics': []}
        user = USERS[state['user_id']]
        service = 'vpn' if re.search('vpn', state['message'], re.I) else (
            'office' if re.search('office|办公', state['message'], re.I) else 'identity')
        diagnostics = []
        for tool, arguments in [('service_status', {'service': service}), ('asset_lookup', {})]:
            try:
                self.skills.guard(user, state['skill_id'], state['skill_version'], 'mcp.' + tool)
                result = self.harness.call(user, server, tool, arguments, state['run_id'])
                diagnostics.append(result)
            except PolicyError as exc:
                diagnostics.append({'tool': tool, 'status': 'failed',
                                    'error': error_text(str(exc), state.get('locale', 'zh-CN')), 'cloud_allowed': False})
        self._event(state['run_id'], 'mcp_preflight', {'server': server,
                    'succeeded': sum(d['status'] == 'succeeded' for d in diagnostics), 'local_only': True})
        # MCP results stay separate from answers, citations, history and cloud payloads.
        return {'diagnostics': diagnostics}

    def _retrieve(self, state):
        self._tool(state, 'knowledge.search')
        self._event(state['run_id'], 'retrieve', '执行权限过滤、检索与来源检查')
        user = USERS[state['user_id']]
        context = self._context(state)
        run = self.store.get('run', state['run_id'])
        self.store.put('run', {**run, 'memory_refs': context['dependencies']['memory_refs']})
        result = self.knowledge.answer(state['message'], user, state['run_id'], context=context)
        status = result.get('status', 'completed')
        if status == 'ready':
            status = 'completed'
        self._event(state['run_id'], 'evidence', {'citations': len(result.get('citations', [])),
                                                'status': status})
        return {'answer': result['answer'], 'citations': result.get('citations', []),
                'retrieval': result.get('retrieval', {}), 'status': status}

    def _prepare_approval(self, state):
        self._tool(state, 'access.request')
        existing = [a for a in self.store.list('approval') if a['run_id'] == state['run_id']]
        if existing:
            return {'approval_id': existing[0]['id']}
        match = re.search(r'Figma|Visio|Office|VPN|Adobe Acrobat|Project', state['message'], re.I)
        application = match.group(0) if match else system_text('待 IT 确认的软件', state.get('locale', 'zh-CN'))
        item = {'id': new_id('apr'), 'run_id': state['run_id'], 'requester_id': state['user_id'],
                'tool': 'access.grant', 'parameters': {'application': application, 'access': 'standard',
                'reason': redact(state['message'][:300])}, 'status': 'pending',
                'expires_at': (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
                'skill_id': state['skill_id'], 'skill_version': state['skill_version'],
                'skill_digest': self.skills.get(state['skill_id'], state['skill_version'])['digest'],
                'policy_version': POLICY_VERSION}
        item['digest'] = approval_digest(item)
        with self.store.transaction():
            self.store.put('approval', item)
            self.store.audit(state['user_id'], 'approval.request', item['id'], {'tool': item['tool']})
        self._event(state['run_id'], 'approval', '已保存具体申请，等待 IT 审批；尚未执行权限变更')
        return {'approval_id': item['id']}

    def _approval(self, state):
        approval = self.store.get('approval', state['approval_id'])
        if approval['status'] == 'pending':
            interrupt({'approval_id': approval['id'], 'parameters': approval['parameters'],
                       'message': system_text('请 IT 审核本次模拟权限申请', state.get('locale', 'zh-CN'))})
            approval = self.store.get('approval', state['approval_id'])
        return {'decision': approval['status']}

    def _validate_approval(self, approval):
        if approval_digest(approval) != approval['digest']:
            raise PolicyError('审批参数发生变化，请重新申请。')
        package = self.skills.get(approval['skill_id'])
        if package['version'] != approval['skill_version'] or package['digest'] != approval['skill_digest']:
            raise PolicyError('技能版本已变化，请重新申请审批。')
        if approval['policy_version'] != POLICY_VERSION:
            raise PolicyError('权限策略已变化，请重新申请审批。')
        if datetime.fromisoformat(approval['expires_at']) <= datetime.now(timezone.utc):
            raise PolicyError('审批已过期，请重新申请。')

    def _execute(self, state):
        with self.store.transaction():
            approval = self.store.get('approval', state['approval_id'])
            receipt = self.store.get('grant', approval['id'])
            if receipt:
                return {'status': 'completed', 'answer': receipt['message'], 'citations': []}
            if approval['status'] == 'rejected':
                return {'status': 'rejected', 'answer': system_text('IT 已拒绝本次申请，未执行权限变更。', state.get('locale', 'zh-CN')), 'citations': []}
            if approval['status'] != 'approved':
                raise PolicyError('操作尚未获得有效审批。')
            self._validate_approval(approval)
            actor = USERS[approval['approved_by']]
            self._tool(state, 'access.grant', actor)
            message = f"已完成 {approval['parameters']['application']} 标准权限的模拟开通。没有修改真实企业系统。"
            if state.get('locale', 'zh-CN') == 'en':
                message = f"Simulated standard access to {approval['parameters']['application']} is complete. No real enterprise system was modified."
            self.store.put('grant', {'id': approval['id'], 'run_id': state['run_id'],
                                    'user_id': state['user_id'], 'parameters': approval['parameters'],
                                    'message': message, 'simulated': True})
            self.store.put('approval', {**approval, 'status': 'consumed', 'consumed_at': now()})
            self.store.audit(actor.id, 'access.grant.simulated', approval['id'], approval['parameters'])
        self._event(state['run_id'], 'execute', '模拟权限变更与幂等执行凭证已原子保存')
        return {'status': 'completed', 'answer': message, 'citations': []}

    def _finish(self, run_id, result):
        run = self.store.get('run', run_id)
        if '__interrupt__' in result:
            run.update(status='awaiting_approval', approval_id=result.get('approval_id'),
                       answer=system_text('申请已准备好，等待 IT 审批。你可以离开页面，稍后继续。', run.get('locale', 'zh-CN')))
        else:
            for key in ('answer', 'status', 'citations', 'retrieval', 'approval_id', 'diagnostics'):
                if key in result:
                    run[key] = result[key]
        run['completed_at'] = now() if run['status'] != 'awaiting_approval' else None
        return self.store.put('run', run)

    def run(self, user, message, thread_id=None, ticket_id=None, cloud_allowed=True, mcp_server=None, locale='en'):
        with self.lock:
            if locale not in ('en', 'zh-CN'):
                raise ValueError('Unsupported locale; use en or zh-CN.')
            if not message.strip() or len(message) > 8000:
                raise PolicyError('问题不能为空，且最多 8,000 个字符。')
            thread_id = thread_id or new_id('thread')
            thread = self.store.get('thread', thread_id)
            if thread and thread['user_id'] != user.id:
                raise PolicyError('无权继续此会话。')
            if ticket_id:
                ticket = self.store.get('ticket', ticket_id)
                if not ticket:
                    raise PolicyError('工单不存在。')
                own_or_staff(user, ticket, 'owner_id')
            run_id = new_id('run')
            thread = thread or {'id': thread_id, 'user_id': user.id, 'initial_run_id': run_id,
                                'progress_run_ids': []}
            if re.search(r'已经|已尝试|已完成|仍然|目前|现在|重启|更换|\b(?:already|tried|completed|still|restarted|rebooted|now)\b', message, re.I):
                thread['progress_run_ids'] = (thread.get('progress_run_ids', []) + [run_id])[-8:]
            self.store.put('thread', thread)
            state = {'run_id': run_id, 'user_id': user.id, 'message': message.strip(),
                     'thread_id': thread_id, 'ticket_id': ticket_id, 'cloud_allowed': cloud_allowed,
                     'mcp_server': mcp_server, 'locale': locale}
            self.store.put('run', {**state, 'id': run_id, 'status': 'running', 'events': [],
                                   'answer': '', 'citations': [], 'retrieval': {}, 'steps': 0})
            try:
                result = self.graph.invoke(state, self._config(run_id), durability='sync')
                return self._finish(run_id, result)
            except Exception as exc:
                error = error_text(str(redact(str(exc))), locale) if isinstance(exc, (PolicyError, ValueError)) else system_text('任务执行失败，请查看运行记录并重试。', locale)
                self.store.audit(user.id, 'run.failed', run_id, {'type': type(exc).__name__, 'reason': error})
                return self.store.put('run', {**self.store.get('run', run_id), 'status': 'failed', 'answer': error})

    def decide(self, user, approval_id, decision):
        require_role(user, 'it', 'admin')
        if decision not in ('approve', 'reject'):
            raise PolicyError('审批决定无效。')
        with self.lock:
            with self.store.transaction():
                item = self.store.get('approval', approval_id)
                if not item:
                    raise PolicyError('审批不存在。')
                if item['status'] in ('consumed', 'rejected'):
                    return item
                self._validate_approval(item)
                if item['status'] == 'pending':
                    item = self.store.put('approval', {**item, 'status': 'approved' if decision == 'approve' else 'rejected',
                                                      'approved_by': user.id, 'decided_at': now()})
                    self.store.audit(user.id, f'approval.{decision}', approval_id)
            result = self.graph.invoke(Command(resume=True), self._config(item['run_id']), durability='sync')
            self._finish(item['run_id'], result)
            return self.store.get('approval', approval_id)

    def recover(self):
        """Continue committed approval decisions and unfinished nodes after process restart."""
        with self.lock:
            for run in self.store.list('run'):
                if run['status'] not in ('running', 'awaiting_approval'):
                    continue
                try:
                    snapshot = self.graph.get_state(self._config(run['id']))
                    approval_id = snapshot.values.get('approval_id')
                    approval = self.store.get('approval', approval_id) if approval_id else None
                    if approval and approval['status'] == 'pending':
                        self._finish(run['id'], {**snapshot.values, '__interrupt__': True})
                    elif snapshot.next:
                        payload = Command(resume=True) if approval else None
                        self._finish(run['id'], self.graph.invoke(payload, self._config(run['id']), durability='sync'))
                    elif snapshot.values.get('status'):
                        self._finish(run['id'], snapshot.values)
                    else:
                        self.store.put('run', {**run, 'status': 'failed', 'answer': system_text('服务中断发生在检查点保存前，请重新提交。', run.get('locale', 'zh-CN'))})
                except Exception as exc:
                    self.store.audit('system', 'recovery.failed', run['id'], {'type': type(exc).__name__})
                    detail = str(redact(str(exc))) if isinstance(exc, PolicyError) else '恢复执行失败'
                    answer = f'{detail}，请重新提交任务或联系 IT。'
                    if run.get('locale', 'zh-CN') == 'en':
                        answer = error_text(detail, 'en') + ' Submit the task again or contact IT.'
                    self.store.put('run', {**self.store.get('run', run['id']), 'status': 'failed',
                        'answer': answer, 'completed_at': now()})

    def memories(self, user):
        return [m for m in self.store.list('memory') if m['user_id'] == user.id and not m.get('deleted')]

    def save_memory(self, user, text, confirmed, memory_id=None):
        if not confirmed:
            raise PolicyError('长期偏好必须由用户明确确认后保存。')
        if not text.strip() or len(text) > 500:
            raise PolicyError('偏好内容需为 1–500 个字符。')
        check_outbound([text])
        with self.store.transaction():
            old = self.store.get('memory', memory_id) if memory_id else None
            if memory_id and (not old or old['user_id'] != user.id or old.get('deleted')):
                raise PolicyError('记忆不存在或无权编辑。')
            result = self.store.put('memory', {'id': memory_id or new_id('mem'), 'user_id': user.id,
                                    'text': text.strip(), 'confirmed': True, 'deleted': False,
                                    'revision': (old or {}).get('revision', 0) + 1, 'source': '用户明确确认'})
            self.store.audit(user.id, 'memory.save', result['id'], {'revision': result['revision']})
        return result

    def delete_memory(self, user, memory_id):
        with self.store.transaction():
            old = self.store.get('memory', memory_id)
            if not old or old['user_id'] != user.id:
                raise PolicyError('记忆不存在或无权删除。')
            self.store.put('memory', {**old, 'text': '', 'deleted': True, 'revision': old['revision'] + 1})
            self.store.audit(user.id, 'memory.delete', memory_id)

    def close(self):
        if not self._closed:
            self.checkpoint_conn.close()
            self._closed = True
