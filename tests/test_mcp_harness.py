import copy

import pytest
from fastapi.testclient import TestClient

from deskpilot.api import create_app
from deskpilot.config import Settings
from deskpilot.db import Store
from deskpilot.policy import PolicyError, USERS


def test_connector_endpoints_exist_and_do_not_expose_credentials(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)) as client:
        client.get('/api/bootstrap')
        response = client.get('/api/connectors')
        assert response.status_code == 200
        assert response.json()['items'][0]['id'] == 'demo-it'
        assert 'token' not in response.text.lower()


def make_harness(tmp_path, transport):
    from deskpilot.harness import ToolHarness
    return ToolHarness(Store(tmp_path / 'harness.sqlite'), Settings(_env_file=None, data_dir=tmp_path), transport)


class FakeTransport:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.poison = False
        self.large = False

    def execute(self, server, tool, arguments, timeout, authorize):
        from deskpilot.mcp_contracts import CONTRACTS
        authorize()
        self.calls.append((server, tool, arguments))
        if self.fail:
            raise TimeoutError('private upstream error')
        descriptor = copy.deepcopy(CONTRACTS[tool])
        if self.poison:
            descriptor['inputSchema']['properties']['shell'] = {'type': 'string'}
        result = {'service': arguments.get('service', 'vpn'), 'status': 'operational',
                  'summary': 'x' * 20000 if self.large else '正常', 'observed_at': '2026-10-06T00:00:00Z', 'simulated': True}
        return descriptor, result


def test_denies_unknown_tools_and_cross_user_assets_before_transport(tmp_path):
    transport = FakeTransport()
    harness = make_harness(tmp_path, transport)
    for tool, arguments in [('shell.exec', {}), ('asset_lookup', {'user_id': 'bob'})]:
        with pytest.raises(PolicyError):
            harness.call(USERS['alice'], 'demo-it', tool, arguments)
    assert transport.calls == []


def test_schema_drift_and_oversized_results_are_rejected(tmp_path):
    transport = FakeTransport()
    harness = make_harness(tmp_path, transport)
    transport.poison = True
    with pytest.raises(PolicyError):
        harness.call(USERS['alice'], 'demo-it', 'service_status', {'service': 'vpn'})
    transport.poison, transport.large = False, True
    with pytest.raises(PolicyError):
        harness.call(USERS['alice'], 'demo-it', 'service_status', {'service': 'vpn'})


def test_failures_open_persistent_circuit_and_only_admin_can_reset(tmp_path):
    transport = FakeTransport()
    transport.fail = True
    harness = make_harness(tmp_path, transport)
    for _ in range(3):
        with pytest.raises(PolicyError):
            harness.call(USERS['alice'], 'demo-it', 'service_status', {'service': 'vpn'})
    from deskpilot.harness import ToolHarness
    restored = ToolHarness(harness.store, harness.settings, transport)
    with pytest.raises(PolicyError):
        restored.call(USERS['alice'], 'demo-it', 'service_status', {'service': 'vpn'})
    assert len(transport.calls) == 3
    with pytest.raises(PolicyError):
        restored.reset(USERS['alice'], 'demo-it')
    restored.reset(USERS['admin'], 'demo-it')
    transport.fail = False
    result = restored.call(USERS['alice'], 'demo-it', 'service_status', {'service': 'vpn'})
    assert result['status'] == 'succeeded'
    assert result['cloud_allowed'] is False
    assert 'private upstream error' not in str(harness.store.list('tool_call'))


def test_real_stdio_mcp_and_owner_binding(tmp_path):
    from deskpilot.harness import ToolHarness
    store = Store(tmp_path / 'real.sqlite')
    harness = ToolHarness(store, Settings(_env_file=None, data_dir=tmp_path))
    result = harness.call(USERS['alice'], 'demo-it', 'asset_lookup', {})
    assert result['output']['user_id'] == 'alice'
    assert result['output']['simulated'] is True
    assert result['contract_digest']
    stages = [event['stage'] for event in result['events']]
    assert stages == ['before_tool', 'after_tool']
    store.close()


def test_run_mcp_preflight_and_history_stays_local(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path), seed=False)) as client:
        client.get('/api/bootstrap')
        response = client.post('/api/runs', json={'message': 'VPN 809', 'mcp_server': 'demo-it', 'cloud_allowed': False})
        assert response.status_code == 200
        run = response.json()
        assert len(run['diagnostics']) == 2
        assert run['diagnostics'][1]['output']['user_id'] == 'alice'
        assert all(x['cloud_allowed'] is False for x in run['diagnostics'])
        client.post('/api/session', json={'user_id': 'bob'})
        assert client.get('/api/tool-calls').json()['items'] == []


def test_remote_is_disabled_and_endpoint_validation_denies_ssrf(tmp_path):
    harness = make_harness(tmp_path, FakeTransport())
    with pytest.raises(PolicyError):
        harness.call(USERS['alice'], 'enterprise-it', 'service_status', {'service': 'vpn'})
    from deskpilot.mcp_transport import validate_remote_url
    for url, host in [('http://example.com/mcp', 'example.com'),
                      ('https://127.0.0.1/mcp', '127.0.0.1'),
                      ('https://user:secret@example.com/mcp', 'example.com'),
                      ('https://evil.example/mcp', 'example.com'),
                      ('https://example.com/mcp?key=secret', 'example.com')]:
        with pytest.raises(PolicyError):
            validate_remote_url(url, host)
