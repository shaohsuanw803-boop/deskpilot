import asyncio
import copy
import json
import logging
import socket

import httpx
import pytest

from deskpilot.config import Settings
from deskpilot.mcp_contracts import CONTRACTS
from deskpilot.mcp_transport import MCPTransport, validate_remote_url


def test_transport_logs_do_not_expose_remote_payloads(caplog):
    MCPTransport(Settings(_env_file=None))
    with caplog.at_level(logging.WARNING, logger='mcp.client.streamable_http'):
        logging.getLogger('mcp.client.streamable_http').warning('Raw result: %s', 'private-fixture-payload')
    assert 'private-fixture-payload' not in caplog.text


@pytest.mark.parametrize('changed', [False, True])
def test_streamable_http_handshake_and_contract_checked_before_call(monkeypatch, changed):
    """Exercise official SDK with HTTP fixtures, not a paid/real enterprise endpoint."""
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [(2, 1, 6, '', ('8.8.8.8', 443))])
    methods = []
    real_client = httpx.AsyncClient
    descriptor = copy.deepcopy(CONTRACTS['service_status'])
    if changed:
        descriptor['inputSchema']['properties']['unexpected'] = {'type': 'string'}

    def handler(request):
        assert str(request.url) == 'https://mcp.example.com/mcp'
        assert request.headers['Authorization'] == 'Bearer integration-fixture'
        if request.method != 'POST':
            return httpx.Response(405)
        body = json.loads(request.content)
        method = body['method']
        methods.append(method)
        if 'id' not in body:
            return httpx.Response(202)
        if method == 'initialize':
            result = {'protocolVersion': '2025-11-25', 'capabilities': {'tools': {}},
                      'serverInfo': {'name': 'fixture', 'version': '1'}}
        elif method == 'tools/list':
            result = {'tools': [descriptor]}
        else:
            assert method == 'tools/call'
            result = {'content': [], 'structuredContent': {'service': 'vpn', 'status': 'operational',
                'summary': 'fixture', 'observed_at': '2026-10-06T00:00:00Z', 'simulated': True}}
        return httpx.Response(200, json={'jsonrpc': '2.0', 'id': body['id'], 'result': result})

    def client_factory(**kwargs):
        assert kwargs['trust_env'] is False
        assert kwargs['follow_redirects'] is False
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, 'AsyncClient', client_factory)
    settings = Settings(_env_file=None, mcp_remote_enabled=True,
                        mcp_remote_url='https://mcp.example.com/mcp',
                        mcp_remote_allowed_host='mcp.example.com', mcp_remote_token='integration-fixture')
    transport = MCPTransport(settings)
    calls = []
    if changed:
        with pytest.raises(Exception):
            transport.execute('enterprise-it', 'service_status', {'service': 'vpn'}, 5, lambda: calls.append(1))
        assert 'tools/call' not in methods
    else:
        _, result = transport.execute('enterprise-it', 'service_status', {'service': 'vpn'}, 5, lambda: calls.append(1))
        assert result['service'] == 'vpn'
        assert methods[:3] == ['initialize', 'notifications/initialized', 'tools/list']
        assert 'tools/call' in methods
        assert len(calls) >= 4


def test_dns_mixed_public_private_is_denied(monkeypatch):
    from deskpilot.policy import PolicyError
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [
        (2, 1, 6, '', ('8.8.8.8', 443)), (2, 1, 6, '', ('169.254.169.254', 443))])
    with pytest.raises(PolicyError):
        validate_remote_url('https://mcp.example.com/mcp', 'mcp.example.com')


def test_sdk_deadline_cancels_stalled_exchange(monkeypatch, tmp_path):
    transport = MCPTransport(Settings(_env_file=None, data_dir=tmp_path))
    async def stall(*args):
        await asyncio.sleep(10)
    monkeypatch.setattr(transport, '_exchange', stall)
    with pytest.raises(TimeoutError):
        transport.execute('demo-it', 'service_status', {'service': 'vpn'}, 0.2, lambda: None)
