"""Real MCP stdio server with fictional IT data; no secrets or filesystem tools."""
import asyncio
from datetime import datetime, timezone

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from .mcp_contracts import CONTRACTS

server = Server('deskpilot-demo-it')


@server.list_tools()
async def list_tools():
    return [types.Tool(**spec, annotations=types.ToolAnnotations(readOnlyHint=True, openWorldHint=False))
            for spec in CONTRACTS.values()]


@server.call_tool()
async def call_tool(name, arguments):
    if name == 'service_status':
        service = arguments['service']
        return {'service': service, 'status': 'degraded' if service == 'vpn' else 'operational',
                'summary': '虚构演示：VPN 网关延迟升高，IT 正在处理。' if service == 'vpn' else '虚构演示：服务运行正常。',
                'observed_at': datetime.now(timezone.utc).isoformat(), 'simulated': True}
    if name == 'asset_lookup':
        user_id = arguments['user_id']
        return {'user_id': user_id, 'device': '演示笔记本',
                'os': 'macOS 14' if user_id == 'bob' else 'Windows 11', 'managed': True, 'simulated': True}
    raise ValueError('Unknown tool')


async def main():
    async with stdio_server() as (reader, writer):
        await server.run(reader, writer, server.create_initialization_options())


if __name__ == '__main__':
    asyncio.run(main())
