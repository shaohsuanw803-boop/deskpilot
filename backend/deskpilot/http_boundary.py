"""Bound incoming HTTP work before parsers, with safe request correlation.

The semaphore belongs to one backend process. It limits admitted API mutations,
not users or distributed traffic, and is deliberately independent of model budgets.
"""
import asyncio
import json
import logging
import math
import re
import threading
import time
import uuid

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from .localization import request_locale


logger = logging.getLogger('deskpilot.http')
_UPLOAD_PATH = re.compile(r'/api/knowledge(?:/[^/]+/versions)?/?\Z')
_READ_METHODS = {'GET', 'HEAD', 'OPTIONS'}
_HTTP_METHODS = _READ_METHODS | {'POST', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'CONNECT'}


class RequestBoundaryMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int = 64 * 1024,
                 max_upload_bytes: int = 21 * 1024 * 1024, max_concurrent_requests: int = 4,
                 body_timeout_seconds: float = 15):
        if any(not isinstance(value, int) or isinstance(value, bool) or value < 1
               for value in (max_body_bytes, max_upload_bytes, max_concurrent_requests)):
            raise ValueError('HTTP body and admission limits must be positive integers.')
        if (not isinstance(body_timeout_seconds, (int, float)) or isinstance(body_timeout_seconds, bool)
                or not math.isfinite(body_timeout_seconds) or body_timeout_seconds <= 0):
            raise ValueError('HTTP body timeout must be a finite positive number.')
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.max_upload_bytes = max_upload_bytes
        self.body_timeout_seconds = body_timeout_seconds
        self._slots = threading.BoundedSemaphore(max_concurrent_requests)

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        started = time.monotonic()
        request_id = uuid.uuid4().hex
        scope.setdefault('state', {})['request_id'] = request_id
        request_headers = scope.get('headers', [])
        language = next((value.decode('latin-1') for key, value in request_headers
                         if key.lower() == b'accept-language'), '')
        locale = request_locale(language)
        response_started = False
        status = 500
        admitted = False

        async def traced_send(message):
            nonlocal response_started, status
            if message['type'] == 'http.response.start':
                response_started = True
                status = message['status']
                headers = [(key, value) for key, value in message.get('headers', [])
                           if key.lower() != b'x-request-id']
                message = {**message, 'headers': headers + [(b'x-request-id', request_id.encode('ascii'))]}
            await send(message)

        async def reject(code):
            messages = {
                408: ('Request body was not received in time.', '请求内容接收超时。'),
                413: ('Request body exceeds the allowed size.', '请求内容超过允许的大小。'),
                503: ('The service is busy. Try again shortly.', '服务繁忙，请稍后重试。'),
                500: ('The request could not be completed.', '请求未能完成。'),
            }
            headers = {'Cache-Control': 'no-store'}
            if code == 503:
                headers['Retry-After'] = '1'
            response = JSONResponse({'detail': messages[code][locale == 'zh-CN'], 'request_id': request_id},
                                    status_code=code, headers=headers)
            await response(scope, receive, traced_send)

        try:
            path = scope.get('path', '')
            method = scope.get('method', '')
            mutation = (path == '/api' or path.startswith('/api/')) and method not in _READ_METHODS
            if mutation:
                admitted = self._slots.acquire(blocking=False)
                if not admitted:
                    await reject(503)
                    return

            limit = (self.max_upload_bytes if method == 'POST' and _UPLOAD_PATH.fullmatch(path)
                     else self.max_body_bytes)
            # Content-Length is only an early rejection hint. Actual received bytes
            # are always counted, including when the header is missing or dishonest.
            for key, value in request_headers:
                if key.lower() != b'content-length':
                    continue
                try:
                    declared = int(value)
                except ValueError:
                    continue
                if declared > limit:
                    await reject(413)
                    return

            body = bytearray()
            oversized = False
            try:
                # A deadline for the complete body cannot be prolonged by sending
                # another tiny chunk. Keep application/provider work outside it.
                async with asyncio.timeout(self.body_timeout_seconds):
                    while True:
                        message = await receive()
                        if message['type'] == 'http.disconnect':
                            status = 499  # Log-only: no response is sent to a disconnected peer.
                            return
                        if message['type'] != 'http.request':
                            raise RuntimeError('Unexpected ASGI request event.')
                        chunk = message.get('body', b'')
                        if len(body) + len(chunk) > limit:
                            oversized = True
                            break
                        body.extend(chunk)
                        if not message.get('more_body', False):
                            break
            except TimeoutError:
                await reject(408)
                return
            if oversized:
                await reject(413)
                return

            # Only a completely bounded body reaches the downstream multipart/JSON
            # parser. Forward subsequent receives to preserve streaming disconnects.
            complete_body = bytes(body)
            del body
            replayed = False

            async def replay_receive():
                nonlocal replayed, complete_body
                if not replayed:
                    replayed = True
                    message = {'type': 'http.request', 'body': complete_body, 'more_body': False}
                    complete_body = b''
                    return message
                return await receive()

            await self.app(scope, replay_receive, traced_send)
        except asyncio.CancelledError:
            if not response_started:
                status = 499
            raise
        except Exception:
            if not response_started:
                await reject(500)
            # Keep the server's normal error reporting; never echo exception text.
            raise
        finally:
            if admitted:
                self._slots.release()
            route = getattr(scope.get('route'), 'path', None) or '(unmatched)'
            method = scope.get('method', '')
            logger.info(json.dumps({'request_id': request_id,
                'method': method if method in _HTTP_METHODS else 'OTHER', 'route': route,
                'status': status, 'elapsed_ms': round((time.monotonic() - started) * 1000, 2)},
                ensure_ascii=True))
