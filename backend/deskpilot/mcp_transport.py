"""MCP SDK transport. Fixed local command or operator-configured HTTPS endpoint."""
import asyncio
import ipaddress
import logging
import os
import socket
import sys
from datetime import timedelta
from urllib.parse import urlsplit

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client

from .mcp_contracts import verify_descriptor
from .policy import PolicyError


class PayloadFreeLog(logging.Filter):
    """SDK logs can embed server messages and exceptions; retain metadata only."""
    def filter(self, record):
        record.msg = 'MCP SDK event (payload omitted; see governed execution record)'
        record.args = ()
        record.exc_info = record.exc_text = record.stack_info = None
        return True


def validate_remote_url(url, allowed_host):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or not allowed_host or parsed.hostname != allowed_host
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port not in (None, 443)):
        raise PolicyError('远程 MCP 必须使用明确允许的 HTTPS 主机，不能包含凭据、查询参数或非标准端口。')
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError()
    except (OSError, ValueError):
        raise PolicyError('远程 MCP 主机未解析到允许的公网地址。') from None


class MCPTransport:
    def __init__(self, settings):
        self.settings = settings
        for name in ('mcp.client.streamable_http', 'mcp.client.stdio', 'mcp.client.session', 'mcp.shared.session'):
            logger = logging.getLogger(name)
            if not any(isinstance(item, PayloadFreeLog) for item in logger.filters):
                logger.addFilter(PayloadFreeLog())

    def execute(self, server, tool, arguments, timeout, authorize):
        return asyncio.run(self._execute(server, tool, arguments, timeout, authorize))

    async def _exchange(self, streams, tool, arguments, timeout, authorize):
        async with ClientSession(streams[0], streams[1], read_timeout_seconds=timedelta(seconds=timeout)) as session:
            await session.initialize()
            listed = await session.list_tools()
            matching = [t for t in listed.tools if t.name == tool]
            if len(matching) != 1:
                raise PolicyError('远程 MCP 缺少唯一的审核工具。')
            descriptor = matching[0].model_dump(by_alias=True)
            verify_descriptor(tool, descriptor)  # MUST run before tools/call.
            authorize()
            result = await session.call_tool(tool, arguments=arguments)
            if result.isError or result.structuredContent is None:
                raise PolicyError('MCP 没有返回有效的结构化结果。')
            return descriptor, result.structuredContent

    async def _execute(self, server, tool, arguments, timeout, authorize):
        async with asyncio.timeout(timeout):
            if server == 'demo-it':
                params = StdioServerParameters(command=sys.executable,
                    args=['-m', 'deskpilot.mcp_demo_server'], cwd=str(self.settings.repo_root),
                    env={'PYTHONUTF8': '1', 'PYTHONPATH': str(self.settings.repo_root / 'backend')})
                # The SDK inherits only its OS variable allowlist, not API credentials.
                # Child stderr may contain untrusted text; don't put it in HTTP/application logs.
                with open(os.devnull, 'w') as errlog:
                    async with stdio_client(params, errlog=errlog) as streams:
                        return await self._exchange(streams, tool, arguments, timeout, authorize)
            if server != 'enterprise-it' or not self.settings.mcp_remote_enabled:
                raise PolicyError('远程 MCP 尚未启用。')
            url, host = self.settings.mcp_remote_url, self.settings.mcp_remote_allowed_host
            await asyncio.to_thread(validate_remote_url, url, host)
            token = self.settings.mcp_remote_token.get_secret_value()
            if not token:
                raise PolicyError('远程 MCP 独立凭据未配置。')

            async def guard(request):
                if str(request.url) != url:
                    raise PolicyError('禁止 MCP 重定向或向其他地址发送凭据。')
                await asyncio.to_thread(validate_remote_url, url, host)
                authorize()

            async with httpx.AsyncClient(headers={'Authorization': f'Bearer {token}'},
                    timeout=timeout, follow_redirects=False, trust_env=False,
                    event_hooks={'request': [guard]}) as client:
                async with streamable_http_client(url, http_client=client) as streams:
                    return await self._exchange(streams, tool, arguments, timeout, authorize)
