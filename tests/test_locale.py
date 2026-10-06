from fastapi.testclient import TestClient

from deskpilot.api import create_app
from deskpilot.config import Settings
from deskpilot.policy import USERS
from deskpilot.workflow import DeskService
from deskpilot.localization import expand_query, request_locale


def test_new_runs_default_to_english_and_support_explicit_chinese(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        english = client.post('/api/runs', json={'message': 'No matching document'}).json()
        assert english['locale'] == 'en'
        assert 'No accessible' in english['answer']
        chinese = client.post('/api/runs', json={'message': '没有匹配资料'},
                              headers={'Accept-Language': 'zh-CN'}).json()
        assert chinese['locale'] == 'zh-CN'
        assert '没有找到' in chinese['answer']
        explicit = client.post('/api/runs', json={'message': 'none', 'locale': 'en'},
                               headers={'Accept-Language': 'zh-CN'}).json()
        assert explicit['locale'] == 'en'
        invalid = client.post('/api/runs', json={'message': 'none', 'locale': 'fr'})
        assert invalid.status_code == 422
        assert 'input' not in invalid.json()['detail'][0]


def test_english_request_approval_keeps_language_after_restart(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        run = client.post('/api/runs', json={
            'message': 'Request standard Visio access for process diagrams'}).json()
        assert run['status'] == 'awaiting_approval'
        assert 'approval' in run['answer']
        snapshot = app.state.service.graph.get_state(app.state.service._config(run['id']))
        assert snapshot.values['locale'] == 'en'
        assert client.post(f"/api/approvals/{run['approval_id']}/decision",
                           json={'decision': 'approve'}).status_code == 403
        app.state.service.close()
        app.state.service = DeskService(app.state.store, app.state.service.settings, app.state.knowledge)
        app.state.service.recover()
        app.state.service.decide(USERS['chen'], run['approval_id'], 'approve')
        result = client.get(f"/api/runs/{run['id']}", headers={'Accept-Language': 'zh-CN'}).json()
        assert result['locale'] == 'en'
        assert 'Simulated standard access' in result['answer']
        app.state.service.decide(USERS['chen'], run['approval_id'], 'approve')
        assert len(app.state.store.list('grant')) == 1


def test_english_alias_retrieval_preserves_evidence_and_permissions(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=True)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        query = 'Windows 11 Starbridge VPN 5.2 error 809 connection timeout'
        run = client.post('/api/runs', json={'message': query}).json()
        assert run['message'] == query
        assert run['retrieval']['query'] == query
        assert query in run['retrieval']['rewritten_query']
        assert run['citations']
        assert 'Knowledge base excerpts (original language)' in run['answer']
        for citation in run['citations']:
            original = app.state.knowledge.get_source(citation['id'], USERS['alice'])
            assert citation['text'] == original['text']
            assert citation['anchor'] == original['anchor']
        doc_id = run['citations'][0]['document_id']
        app.state.knowledge.withdraw(doc_id, USERS['admin'])
        invalidated = client.get(f"/api/runs/{run['id']}").json()
        assert invalidated['source_invalidated'] is True
        assert invalidated['citations'] == []
        assert 'changed' in invalidated['answer']


def test_errors_are_localized_without_echoing_request_payload(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)) as client:
        assert 'Select a demo identity' in client.get('/api/runs').json()['detail']
        assert '演示身份' in client.get('/api/runs', headers={'Accept-Language': 'zh-CN'}).json()['detail']
        client.get('/api/bootstrap')
        assert 'permission' in client.post('/api/knowledge/missing/publish').json()['detail']
        response = client.post('/api/runs', json={'message': 'secret text', 'locale': 'invalid-secret'})
        assert 'invalid-secret' not in response.text
        unknown = client.post('/api/runs', json={'message': 'none', 'confidential-field-name': 'private data'})
        assert unknown.status_code == 422
        assert 'confidential-field-name' not in unknown.text
        assert 'private data' not in unknown.text


def test_language_negotiation_and_reviewed_aliases():
    assert request_locale(None) == 'en'
    assert request_locale('fr, en-US;q=0.8, zh-CN;q=0.6') == 'en'
    assert request_locale('en;q=0.1, zh-CN;q=0.9') == 'zh-CN'
    assert request_locale('zh-CN;q=0, en') == 'en'
    assert request_locale('fr') == 'en'
    query = 'Starbridge VPN 99.9 error 999998 connection timeout'
    rewritten, aliases = expand_query(query)
    assert rewritten.startswith(query)
    assert aliases == ['星桥', '连接超时']
    assert expand_query('Office will not activate')[1] == ['激活']


def test_display_metadata_does_not_change_signed_skills_or_user_content(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        bootstrap = client.get('/api/bootstrap').json()
        assert bootstrap['user']['name'] == '林晓'
        assert bootstrap['user']['name_en'] == 'Alice Lin'
        english = client.get('/api/skills').json()['items']
        chinese = client.get('/api/skills', headers={'Accept-Language': 'zh-CN'}).json()['items']
        for en, zh in zip(english, chinese):
            assert en['digest'] == zh['digest']
            assert en['instructions'] == zh['instructions']
            assert en['name'] == zh['name']
            assert en['display_name'] != zh['display_name']
            assert en['versions'][0]['display_name'] == en['display_name']
        preference = '我偏好英文；不要改写此记录'
        memory = client.post('/api/memories', json={'text': preference, 'confirmed': True}).json()
        assert memory['text'] == preference
        assert client.get('/api/memories').json()['items'][0]['text'] == preference


def test_chinese_approval_and_legacy_language_fallback(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        run = client.post('/api/runs', json={'message': '申请 Visio 软件权限', 'locale': 'zh-CN'}).json()
        assert '等待 IT 审批' in run['answer']
        app.state.service.decide(USERS['chen'], run['approval_id'], 'reject')
        result = client.get(f"/api/runs/{run['id']}").json()
        assert '已拒绝' in result['answer']
        # Old persisted records have no locale. Their historical language is not rewritten.
        legacy = {**run, 'id': 'legacy-run'}
        legacy.pop('locale')
        app.state.store.put('run', legacy)
        finished = app.state.service._finish('legacy-run', {'__interrupt__': True, 'approval_id': run['approval_id']})
        assert '等待 IT 审批' in finished['answer']


def test_english_ui_examples_and_source_headings(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=True)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        for query in ('My Windows 11 computer gets VPN error 809. How can I troubleshoot it?',
                      'My Office will not activate. How can I troubleshoot it?'):
            result = client.post('/api/runs', json={'message': query}).json()
            assert result['status'] in ('completed', 'needs_clarification')
            assert result['retrieval']['query'] == query
        permission = client.post('/api/runs', json={
            'message': 'I need permission to install software. What is the approval process?'}).json()
        assert permission['status'] == 'awaiting_approval'
        knowledge = app.state.knowledge
        assert knowledge._section_kind('Troubleshooting steps') == 'steps'
        assert knowledge._section_kind('Next steps') == 'next'
        assert knowledge._section_kind('Applicability') == 'basis'
