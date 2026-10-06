import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from deskpilot.api import create_app
from deskpilot.config import Settings
from deskpilot.policy import USERS


@pytest.mark.parametrize('field', [
    'max_run_cost_cny', 'max_daily_cost_cny', 'llm_input_cny_per_million',
    'llm_output_cny_per_million', 'embedding_cny_per_million', 'rerank_cny_per_million',
])
@pytest.mark.parametrize('value', [math.nan, math.inf, -math.inf, -1])
def test_invalid_money_configuration_is_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


@pytest.mark.parametrize('field,value', [
    ('max_retries', -1), ('max_retries', 3), ('max_agent_steps', 0),
    ('request_timeout_seconds', 0), ('request_timeout_seconds', math.nan),
])
def test_invalid_execution_bounds_are_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


def test_zero_budget_and_missing_prices_remain_explicit():
    settings = Settings(_env_file=None, max_run_cost_cny=0, max_daily_cost_cny=0,
                        llm_input_cny_per_million='')
    assert settings.max_run_cost_cny == settings.max_daily_cost_cny == 0
    assert settings.llm_input_cny_per_million is None
    assert 'LLM_INPUT_CNY_PER_MILLION' in settings.cloud_missing()


def test_http_retry_reuses_approval_and_rejects_changed_request(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        headers = {'Idempotency-Key': 'access-request-unique'}
        body = {'message': 'I need standard access to Visio.', 'locale': 'en'}
        first = client.post('/api/runs', json=body, headers=headers)
        second = client.post('/api/runs', json=body, headers=headers)
        assert first.status_code == second.status_code == 200
        assert first.json()['id'] == second.json()['id']
        assert len(app.state.store.list('approval')) == 1
        conflict = client.post('/api/runs', json={**body, 'message': 'I need access to Figma.'}, headers=headers)
        assert conflict.status_code == 409
        assert 'access-request-unique' not in conflict.text
        assert 'Idempotency-Key' in app.openapi()['paths']['/api/runs']['post']['parameters'][0]['name']


def test_idempotent_replay_rechecks_withdrawn_evidence(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        client.get('/api/bootstrap')
        doc = app.state.knowledge.ingest('vpn.md', b'# VPN\nVPN E42 source marker.',
                                         {'cloud_allowed': False}, USERS['admin'])
        app.state.knowledge.publish(doc['id'], USERS['admin'])
        chunk = next(c for c in app.state.store.list('chunk') if c['document_id'] == doc['id'])
        headers = {'Idempotency-Key': 'evidence-retry'}
        body = {'message': 'VPN E42'}
        first = client.post('/api/runs', json=body, headers=headers).json()
        app.state.store.put('run', {**first, 'answer': 'VPN E42 source marker.', 'citations': [chunk]})
        app.state.knowledge.withdraw(doc['id'], USERS['admin'])
        replay = client.post('/api/runs', json=body, headers=headers)
        assert replay.status_code == 200
        assert replay.json()['id'] == first['id']
        assert replay.json()['source_invalidated'] is True
        assert 'source marker' not in replay.text
        assert len(app.state.store.list('run')) == 1


def test_oversized_api_body_is_rejected_before_session_creation(tmp_path):
    app = create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)
    with TestClient(app) as client:
        response = client.post('/api/session', content=b'x' * (64 * 1024 + 1),
                               headers={'Content-Type': 'application/json', 'X-Request-ID': 'untrusted-id'})
        assert response.status_code == 413
        assert len(response.headers['X-Request-ID']) == 32
        assert response.headers['X-Request-ID'] != 'untrusted-id'
        assert not app.state.store.list('session')
