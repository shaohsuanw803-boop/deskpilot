from fastapi.testclient import TestClient

from deskpilot.api import create_app
from deskpilot.config import Settings
from deskpilot.policy import USERS


def test_custom_local_port_accepts_its_own_origin_only(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app, base_url='http://127.0.0.1:8011') as client:
        response = client.post('/api/session', json={'user_id': 'alice'}, headers={'Origin': 'http://127.0.0.1:8011'})
        assert response.status_code == 200
        assert client.post('/api/session', json={'user_id': 'alice'},
                           headers={'Origin': 'http://127.0.0.1:9000'}).status_code == 403


def test_profile_is_server_owned_and_employee_cannot_publish(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        assert client.get('/api/runs').status_code == 401
        bootstrap = client.get('/api/bootstrap').json()
        assert bootstrap['user']['id'] == 'alice'
        assert client.post('/api/session', json={'user_id': 'alice', 'role': 'admin'}).status_code == 422
        assert client.post('/api/knowledge/missing/publish').status_code == 403


def test_public_api_approval_and_memory_flow(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)) as client:
        client.get('/api/bootstrap')
        response = client.post('/api/runs', json={'message': '申请 Figma 软件权限'})
        run = response.json()
        assert run['status'] == 'awaiting_approval'
        assert client.post(f"/api/approvals/{run['approval_id']}/decision", json={'decision': 'approve'}).status_code == 403
        client.post('/api/session', json={'user_id': 'chen'})
        assert client.post(f"/api/approvals/{run['approval_id']}/decision", json={'decision': 'approve'}).json()['status'] == 'consumed'
        client.post('/api/session', json={'user_id': 'alice'})
        assert client.get(f"/api/runs/{run['id']}").json()['status'] == 'completed'
        memory = client.post('/api/memories', json={'text': '优先文字指导', 'confirmed': True}).json()
        client.delete(f"/api/memories/{memory['id']}")
        assert not client.get('/api/memories').json()['items']


def test_cross_origin_mutation_is_rejected(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)) as client:
        response = client.post('/api/session', json={'user_id': 'admin'}, headers={'Origin': 'https://evil.example'})
        assert response.status_code == 403


def test_saved_retrieval_cannot_leak_withdrawn_uncited_evidence(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        rag = app.state.knowledge
        sources = []
        for index in range(2):
            doc = rag.ingest(f'{index}.md', f'VPN E42 独有测试片段 {index}'.encode(),
                             {'title': f'来源{index}', 'cloud_allowed': True}, USERS['admin'])
            rag.publish(doc['id'], USERS['admin'])
            sources.append(next(c for c in app.state.store.list('chunk') if c['document_id'] == doc['id']))
        run = app.state.service.run(USERS['alice'], 'VPN E42')
        run.update(citations=[sources[0]], retrieval={'evidence': sources, 'trace': {}}, answer='只引用第一份')
        app.state.store.put('run', run)
        rag.withdraw(sources[1]['document_id'], USERS['admin'])
        response = client.get(f"/api/runs/{run['id']}")
        assert response.status_code == 200
        assert '独有测试片段 1' not in response.text


def test_draft_preview_is_staff_only_and_not_searchable(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        doc = app.state.knowledge.ingest('draft.md', b'# Draft\nReview before publishing.',
                                        {'cloud_allowed': False}, USERS['admin'])
        assert client.get(f"/api/knowledge/{doc['id']}/preview").status_code == 403
        assert not app.state.knowledge.search('Draft', USERS['alice'])['evidence']
        client.post('/api/session', json={'user_id': 'chen'})
        result = client.get(f"/api/knowledge/{doc['id']}/preview").json()
        assert result['state'] == 'prepared'
        assert 'Review before' in result['chunks'][0]['text']
