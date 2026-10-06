"""Exercise raw ASGI framing before a body parser or business handler runs."""
import asyncio
import json
import re
from types import SimpleNamespace

import pytest
from starlette.requests import Request
from starlette.responses import PlainTextResponse


def boundary(app, **options):
    from deskpilot.http_boundary import RequestBoundaryMiddleware
    return RequestBoundaryMiddleware(app, **options)


def scope(path='/api/runs', method='POST', headers=()):
    return {'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
            'method': method, 'scheme': 'http', 'path': path, 'raw_path': path.encode(),
            'query_string': b'', 'root_path': '', 'headers': list(headers),
            'client': ('127.0.0.1', 1000), 'server': ('localhost', 8000)}


async def invoke(app, request_scope=None, chunks=None, messages=None):
    incoming = list(chunks if chunks is not None else [{'type': 'http.request', 'body': b''}])
    outgoing = messages if messages is not None else []
    reads = []

    async def receive():
        reads.append(True)
        return incoming.pop(0) if incoming else {'type': 'http.disconnect'}

    async def send(message):
        outgoing.append(message)

    await app(request_scope or scope(), receive, send)
    return outgoing, reads


def response(messages):
    start = next(message for message in messages if message['type'] == 'http.response.start')
    body = b''.join(message.get('body', b'') for message in messages if message['type'] == 'http.response.body')
    return start['status'], dict(start['headers']), body


async def echo_app(request_scope, receive, send):
    body = await Request(request_scope, receive).body()
    await PlainTextResponse(body)(request_scope, receive, send)


def test_content_length_rejects_before_reading_or_calling_parser():
    called = []

    async def parser(*args):
        called.append(True)

    messages, reads = asyncio.run(invoke(boundary(parser, max_body_bytes=8),
        scope(headers=[(b'content-length', b'9')]), [{'type': 'http.request', 'body': b'secret'}]))
    status, headers, body = response(messages)
    assert status == 413 and not reads and not called
    assert b'secret' not in body and headers[b'cache-control'] == b'no-store'
    assert re.fullmatch(rb'[a-f0-9]{32}', headers[b'x-request-id'])


@pytest.mark.parametrize('headers', [[], [(b'content-length', b'1')]])
def test_actual_chunked_bytes_reject_missing_or_lying_length(headers):
    called = []

    async def parser(*args):
        called.append(True)

    chunks = [{'type': 'http.request', 'body': b'abcd', 'more_body': True},
              {'type': 'http.request', 'body': b'efghi', 'more_body': True},
              {'type': 'http.request', 'body': b'never-read'}]
    messages, reads = asyncio.run(invoke(boundary(parser, max_body_bytes=8), scope(headers=headers), chunks))
    assert response(messages)[0] == 413 and len(reads) == 2 and not called


def test_limit_counts_utf8_bytes_and_accepts_exact_limit():
    app = boundary(echo_app, max_body_bytes=6)
    accepted, _ = asyncio.run(invoke(app, chunks=[{'type': 'http.request', 'body': '中文'.encode()}]))
    rejected, _ = asyncio.run(invoke(app, chunks=[{'type': 'http.request', 'body': '中文a'.encode()}]))
    assert response(accepted)[0] == 200 and response(accepted)[2] == '中文'.encode()
    assert response(rejected)[0] == 413


@pytest.mark.parametrize('path', ['/api/knowledge', '/api/knowledge/',
                                '/api/knowledge/doc-1/versions', '/api/knowledge/doc-1/versions/'])
def test_upload_allowance_is_bounded_before_multipart_parser(path):
    called = []

    async def parser(request_scope, receive, send):
        called.append(True)
        await Request(request_scope, receive).form()

    chunks = [{'type': 'http.request', 'body': b'--test\r\n', 'more_body': True},
              {'type': 'http.request', 'body': b'x' * 20}]
    messages, _ = asyncio.run(invoke(boundary(parser, max_body_bytes=4, max_upload_bytes=20),
        scope(path, headers=[(b'content-type', b'multipart/form-data; boundary=test')]), chunks))
    assert response(messages)[0] == 413 and not called
    accepted, _ = asyncio.run(invoke(boundary(echo_app, max_body_bytes=4, max_upload_bytes=20),
        scope(path), [{'type': 'http.request', 'body': b'12345'}]))
    assert response(accepted)[0] == 200


@pytest.mark.parametrize('path', ['/api/knowledge/other', '/api/knowledge/a/versions/extra',
                                '/api/knowledge/a/b/versions', '/api/knowledge-other'])
def test_other_routes_do_not_receive_the_upload_allowance(path):
    messages, _ = asyncio.run(invoke(boundary(echo_app, max_body_bytes=4, max_upload_bytes=20),
        scope(path), [{'type': 'http.request', 'body': b'12345'}]))
    assert response(messages)[0] == 413


def test_body_is_complete_before_handler_runs_and_preserves_stream_end():
    state = {'ended': False}
    chunks = [{'type': 'http.request', 'body': b'ab', 'more_body': True},
              {'type': 'http.request', 'body': b'cd', 'more_body': False}]
    sent = []

    async def receive():
        if chunks:
            item = chunks.pop(0)
            state['ended'] = not item.get('more_body', False)
            return item
        return {'type': 'http.disconnect'}

    async def handler(request_scope, replay, send):
        assert state['ended']
        item = await replay()
        assert item == {'type': 'http.request', 'body': b'abcd', 'more_body': False}
        assert await replay() == {'type': 'http.disconnect'}
        await PlainTextResponse('ok')(request_scope, replay, send)

    async def send(item):
        sent.append(item)

    asyncio.run(boundary(handler)(scope(), receive, send))
    assert response(sent)[0] == 200


def test_mutating_admission_precedes_buffering_and_leaves_reads_available():
    async def scenario():
        entered = asyncio.Event()
        release = asyncio.Event()

        async def handler(request_scope, receive, send):
            if request_scope['method'] == 'POST':
                entered.set()
                await release.wait()
            await PlainTextResponse('ok')(request_scope, receive, send)

        app = boundary(handler, max_concurrent_requests=1)
        first = asyncio.create_task(invoke(app))
        await asyncio.wait_for(entered.wait(), 1)
        try:
            rejected, reads = await invoke(app)
            status, headers, _ = response(rejected)
            assert status == 503 and headers[b'retry-after'] == b'1' and not reads
            for path in ('/api/health', '/api/bootstrap', '/api/runs'):
                available, _ = await invoke(app, scope(path, method='GET'))
                assert response(available)[0] == 200
        finally:
            release.set()
            await first
        admitted, _ = await invoke(app)
        assert response(admitted)[0] == 200

    asyncio.run(scenario())


@pytest.mark.parametrize('failure', ['disconnect', 'exception', 'cancel'])
def test_slots_are_released_on_incomplete_or_failed_requests(failure):
    async def scenario():
        calls = []

        async def handler(request_scope, receive, send):
            calls.append(True)
            if request_scope['path'] == '/api/fail':
                if failure == 'cancel':
                    raise asyncio.CancelledError()
                raise RuntimeError('sensitive exception detail')
            await PlainTextResponse('ok')(request_scope, receive, send)

        app = boundary(handler, max_concurrent_requests=1)
        messages = []
        if failure == 'disconnect':
            messages, _ = await invoke(app, chunks=[{'type': 'http.request', 'body': b'a', 'more_body': True},
                                                  {'type': 'http.disconnect'}])
            assert not calls and not messages
        else:
            expected = asyncio.CancelledError if failure == 'cancel' else RuntimeError
            with pytest.raises(expected):
                await invoke(app, scope('/api/fail'), messages=messages)
            if failure == 'exception':
                status, headers, body = response(messages)
                assert status == 500 and b'sensitive' not in body
                assert headers[b'x-request-id']
        subsequent, _ = await invoke(app)
        assert response(subsequent)[0] == 200

    asyncio.run(scenario())


def test_request_id_is_generated_not_reflected_and_visible_in_state():
    ids = []

    async def handler(request_scope, receive, send):
        ids.append(request_scope['state']['request_id'])
        await PlainTextResponse('ok', headers={'X-Request-ID': 'downstream'})(request_scope, receive, send)

    app = boundary(handler)
    messages, _ = asyncio.run(invoke(app, scope(headers=[(b'x-request-id', b'client-secret')])) )
    status, headers, _ = response(messages)
    assert status == 200 and re.fullmatch(rb'[a-f0-9]{32}', headers[b'x-request-id'])
    assert headers[b'x-request-id'].decode() == ids[0]
    assert len([key for key, _ in messages[0]['headers'] if key.lower() == b'x-request-id']) == 1


def test_boundary_error_language_is_explicit_and_safe():
    app = boundary(echo_app, max_body_bytes=1)
    messages, _ = asyncio.run(invoke(app, scope(headers=[(b'accept-language', b'zh-CN')]),
        [{'type': 'http.request', 'body': b'private'}]))
    assert '请求' in json.loads(response(messages)[2])['detail']
    assert b'private' not in response(messages)[2]


def test_non_http_scopes_pass_through_unchanged():
    observed = []

    async def app(request_scope, receive, send):
        observed.append(request_scope)

    asyncio.run(invoke(boundary(app), {'type': 'lifespan'}))
    assert observed == [{'type': 'lifespan'}]


def test_completion_log_uses_only_safe_route_template_and_correlation(caplog):
    async def handler(request_scope, receive, send):
        request_scope['route'] = SimpleNamespace(path='/api/runs/{run_id}')
        await echo_app(request_scope, receive, send)

    request_scope = scope('/api/runs/path-secret', headers=[(b'x-request-id', b'header-secret')])
    request_scope['query_string'] = b'token=query-secret'
    with caplog.at_level('INFO', logger='deskpilot.http'):
        messages, _ = asyncio.run(invoke(boundary(handler), request_scope,
            [{'type': 'http.request', 'body': b'body-secret'}]))
    events = [json.loads(record.message) for record in caplog.records if record.name == 'deskpilot.http']
    assert len(events) == 1
    event = events[0]
    assert set(event) == {'request_id', 'method', 'route', 'status', 'elapsed_ms'}
    assert event['request_id'] == response(messages)[1][b'x-request-id'].decode()
    assert event['route'] == '/api/runs/{run_id}' and event['status'] == 200
    assert event['elapsed_ms'] >= 0 and 'secret' not in json.dumps(event)


def test_rejected_and_disconnected_requests_have_safe_completion_logs(caplog):
    with caplog.at_level('INFO', logger='deskpilot.http'):
        app = boundary(echo_app, max_body_bytes=1)
        asyncio.run(invoke(app, scope('/api/raw-secret'), [{'type': 'http.request', 'body': b'secret'}]))
        asyncio.run(invoke(app, scope('/api/raw-secret'), [{'type': 'http.disconnect'}]))
    events = [json.loads(record.message) for record in caplog.records if record.name == 'deskpilot.http']
    assert [event['status'] for event in events] == [413, 499]
    assert all(event['route'] == '(unmatched)' for event in events)
    assert 'secret' not in json.dumps(events)


@pytest.mark.parametrize('slow_sender', ['stalled', 'trickle'])
def test_body_deadline_releases_admission_without_calling_parser(slow_sender):
    async def scenario():
        called = []
        messages = []

        async def handler(request_scope, receive, send):
            called.append(True)
            await echo_app(request_scope, receive, send)

        async def receive():
            if slow_sender == 'stalled':
                await asyncio.Event().wait()
            # Each chunk arrives within the timeout, but the complete body does not.
            await asyncio.sleep(0.005)
            return {'type': 'http.request', 'body': b'a', 'more_body': True}

        async def send(message):
            messages.append(message)

        app = boundary(handler, max_concurrent_requests=1, body_timeout_seconds=0.02)
        await asyncio.wait_for(app(scope(headers=[(b'accept-language', b'zh-CN')]), receive, send), 0.3)
        status, headers, body = response(messages)
        assert status == 408 and not called
        assert '请求' in json.loads(body)['detail']
        assert json.loads(body)['request_id'] == headers[b'x-request-id'].decode()
        subsequent, _ = await invoke(app)
        assert response(subsequent)[0] == 200 and called == [True]

    asyncio.run(scenario())


def test_application_timeout_is_not_misreported_as_a_body_timeout():
    async def handler(*args):
        raise TimeoutError('private provider timeout')

    messages = []
    with pytest.raises(TimeoutError):
        asyncio.run(invoke(boundary(handler, body_timeout_seconds=0.02), messages=messages))
    assert response(messages)[0] == 500 and b'private' not in response(messages)[2]


@pytest.mark.parametrize('value', [0, -1, float('inf'), float('nan'), True, '15'])
def test_body_deadline_requires_a_finite_positive_number(value):
    with pytest.raises(ValueError, match='body timeout'):
        boundary(echo_app, body_timeout_seconds=value)
