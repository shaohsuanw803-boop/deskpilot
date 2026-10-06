"""Governed read-only MCP execution: policy hooks, persisted traces and circuit breaker."""
import json
import threading
import time
from datetime import datetime, timezone

from .db import new_id, now
from .mcp_contracts import CONTRACTS, digest, validate, verify_descriptor
from .mcp_transport import MCPTransport
from .policy import POLICY_VERSION, PolicyError, check_outbound, redact, require_role


class ToolHarness:
    def __init__(self, store, settings, transport=None):
        self.store, self.settings = store, settings
        self.transport = transport or MCPTransport(settings)
        self.lock = threading.RLock()
        for item in self.store.list('tool_call'):
            if item['status'] == 'running':
                self.store.put('tool_call', {**item, 'status': 'interrupted', 'output': None,
                    'error': '服务重启中断调用；未自动重放。'})

    def catalog(self):
        return [{'id': server, 'name': name, 'transport': transport, 'enabled': enabled,
                 'tools': list(CONTRACTS), 'cloud_allowed': False,
                 'circuit': self.store.get('circuit', server) or {'failures': 0, 'open_until': 0},
                 'contracts': {key: digest(value) for key, value in CONTRACTS.items()}}
                for server, name, transport, enabled in [
                    ('demo-it', '本地 IT 演示', 'stdio', True),
                    ('enterprise-it', '企业 IT 连接器', 'streamable-http', self.settings.mcp_remote_enabled)]]

    def records(self, user):
        return [r for r in self.store.list('tool_call') if r['user_id'] == user.id or user.role in ('it', 'admin')]

    def reset(self, user, server):
        require_role(user, 'admin')
        if server not in ('demo-it', 'enterprise-it'):
            raise PolicyError('未知连接器。')
        with self.lock, self.store.transaction():
            self.store.put('circuit', {'id': server, 'failures': 0, 'open_until': 0})
            self.store.audit(user.id, 'mcp.circuit.reset', server)

    def _authorize(self, user, server, run_id):
        require_role(user, 'employee', 'it', 'admin')
        if server not in ('demo-it', 'enterprise-it') or (server == 'enterprise-it' and not self.settings.mcp_remote_enabled):
            raise PolicyError('连接器不存在或尚未启用。')
        if run_id:
            run = self.store.get('run', run_id)
            if not run or run['user_id'] != user.id or run['status'] != 'running':
                raise PolicyError('任务不属于当前用户或已停止。')
            if run.get('deadline_at') and datetime.fromisoformat(run['deadline_at']) <= datetime.now(timezone.utc):
                raise PolicyError('任务已超时，停止 MCP 调用。')

    def call(self, user, server, tool, arguments, run_id=None):
        with self.lock:
            try:
                return self._call(user, server, tool, arguments, run_id)
            except PolicyError:
                self.store.audit(user.id, 'mcp.denied_or_failed', server if server in ('demo-it', 'enterprise-it') else 'unknown',
                                 {'tool': tool if tool in CONTRACTS else 'unknown', 'run_id': run_id})
                raise

    def _call(self, user, server, tool, arguments, run_id):
        self._authorize(user, server, run_id)
        if tool not in CONTRACTS or not isinstance(arguments, dict):
            raise PolicyError('工具不在本地审核白名单中。')
        arguments = dict(arguments)
        if tool == 'asset_lookup':
            if arguments.get('user_id', user.id) != user.id:
                raise PolicyError('设备查询只能使用当前登录身份。')
            arguments['user_id'] = user.id
        validate(CONTRACTS[tool]['inputSchema'], arguments)
        check_outbound(json.dumps(arguments))
        timeout = self.settings.mcp_timeout_seconds
        with self.store.transaction():
            circuit = self.store.get('circuit', server) or {'id': server, 'failures': 0, 'open_until': 0}
            if circuit['open_until'] > time.time():
                raise PolicyError('连接器已熔断，请稍后再试或由管理员重置。')
            today = now()[:10]
            if sum(c['created_at'][:10] == today for c in self.store.list('tool_call')) >= self.settings.mcp_daily_call_limit:
                raise PolicyError('已达到今日 MCP 调用次数上限。')
            if run_id:
                run = self.store.get('run', run_id)
                if run.get('steps', 0) >= self.settings.max_agent_steps:
                    raise PolicyError('已达到任务工具步骤上限。')
                if run.get('deadline_at'):
                    timeout = min(timeout, (datetime.fromisoformat(run['deadline_at']) - datetime.now(timezone.utc)).total_seconds())
                self.store.put('run', {**run, 'steps': run.get('steps', 0) + 1})
            record = self.store.put('tool_call', {'id': new_id('tool'), 'run_id': run_id, 'user_id': user.id,
                'server': server, 'tool': tool, 'arguments': redact(arguments), 'status': 'running',
                'contract_digest': digest(CONTRACTS[tool]), 'policy_version': POLICY_VERSION,
                'cloud_allowed': False, 'output': None, 'events': [{'stage': 'before_tool', 'at': now()}]})
        started = time.monotonic()
        try:
            descriptor, output = self.transport.execute(server, tool, arguments, timeout,
                lambda: self._authorize(user, server, run_id))
            self._authorize(user, server, run_id)
            if time.monotonic() - started > timeout:
                raise PolicyError('MCP 超过执行时限，结果已丢弃。')
            verify_descriptor(tool, descriptor)
            if len(json.dumps(output, ensure_ascii=False).encode()) > self.settings.mcp_max_result_bytes:
                raise PolicyError('MCP 结果超过大小上限。')
            validate(CONTRACTS[tool]['outputSchema'], output)
            bound = 'user_id' if tool == 'asset_lookup' else 'service'
            if output[bound] != arguments[bound]:
                raise PolicyError('MCP 返回了其他身份或服务的结果。')
            record.update(status='succeeded', output=redact(output))
            record['events'].append({'stage': 'after_tool', 'at': now()})
            circuit.update(failures=0, open_until=0)
        except Exception:
            # Never persist raw SDK/network exceptions or server-provided error strings.
            record.update(status='failed', error='MCP 调用失败、超时或契约校验未通过；未自动重试。')
            record['events'].append({'stage': 'on_error', 'at': now()})
            circuit['failures'] += 1
            if circuit['failures'] >= self.settings.mcp_failure_threshold:
                circuit['open_until'] = time.time() + self.settings.mcp_cooldown_seconds
        record['elapsed_ms'] = round((time.monotonic() - started) * 1000, 2)
        with self.store.transaction():
            self.store.put('circuit', circuit)
            record = self.store.put('tool_call', record)
            self.store.audit(user.id, 'mcp.' + record['status'], record['id'],
                             {'tool': tool, 'server': server, 'elapsed_ms': record['elapsed_ms']})
        if record['status'] != 'succeeded':
            raise PolicyError(record['error'])
        return record
