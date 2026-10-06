"""Versioned, repository-owned skills; no downloaded executable plugins."""
import hashlib
import json

from .db import now
from .policy import PolicyError, USERS, require_role

TOOL_ROLES = {
    'mcp.service_status': {'employee', 'it', 'admin'},
    'mcp.asset_lookup': {'employee', 'it', 'admin'},
    'knowledge.search': {'employee', 'it', 'admin'},
    'ticket.create': {'employee', 'it', 'admin'},
    'access.request': {'employee', 'it', 'admin'},
    'access.grant': {'it', 'admin'},
    'ticket.summarize': {'it', 'admin'},
}


class SkillRegistry:
    def __init__(self, store, settings):
        self.store, self.settings = store, settings
        self.packages = {}
        for file in sorted((settings.repo_root / 'skills').glob('*/*.json')):
            package = json.loads(file.read_text(encoding='utf-8'))
            package['digest'] = hashlib.sha256(file.read_bytes()).hexdigest()
            self.packages[(package['id'], package['version'])] = package
        self._initialize()

    def _initialize(self):
        for (skill_id, version), package in self.packages.items():
            if self.store.get('skill', skill_id) is None:
                self.store.put('skill', {'id': skill_id, 'active_version': '1.0.0'})

    def get(self, skill_id, version=None):
        record = self.store.get('skill', skill_id)
        if not record:
            raise PolicyError('技能不存在。')
        version = version or record['active_version']
        if (skill_id, version) not in self.packages:
            raise PolicyError('技能版本不存在。')
        return self.packages[(skill_id, version)]

    def list(self):
        result = []
        for record in self.store.list('skill'):
            active = self.get(record['id'])
            versions = []
            for (skill_id, version), package in self.packages.items():
                if skill_id == record['id']:
                    evaluation = self.store.get('skill_evaluation', f'{skill_id}:{version}')
                    versions.append({**package, 'status': 'active' if version == record['active_version']
                                     else 'draft', 'evaluation': evaluation})
            result.append({**active, **record, 'versions': versions})
        return result

    def guard(self, user, skill_id, version, tool):
        package = self.get(skill_id, version)
        if tool not in package['allowed_tools'] or user.role not in TOOL_ROLES.get(tool, set()):
            raise PolicyError('技能或当前身份没有调用此工具的权限。')

    def evaluate(self, user, skill_id, version, knowledge):
        require_role(user, 'admin', 'it')
        package = self.get(skill_id, version)
        checks = []
        for tool in ['shell.exec', 'database.delete', 'network.fetch']:
            try:
                self.guard(USERS['admin'], skill_id, version, tool)
                passed = False
            except PolicyError:
                passed = True
            checks.append({'name': f'拒绝未声明工具 {tool}', 'passed': passed})
        try:
            self.guard(USERS['alice'], skill_id, version, 'access.grant')
            safe = False
        except PolicyError:
            safe = True
        checks.append({'name': '员工不能直接执行权限发放', 'passed': safe})
        checks.append({'name': '所有声明工具均有服务端权限策略',
                       'passed': all(tool in TOOL_ROLES for tool in package['allowed_tools'])})
        if skill_id == 'diagnose':
            search = knowledge.search('VPN 809', USERS['alice'], strategy='bm25')
            checks.append({'name': 'VPN 809 检索具有可追溯证据', 'passed': bool(search['evidence'])})
        result = self.store.put('skill_evaluation', {
            'id': f'{skill_id}:{version}', 'skill_id': skill_id, 'version': version,
            'digest': package['digest'], 'passed': all(c['passed'] for c in checks),
            'checks': checks, 'at': now(), 'scope': '协议与安全回归；云端回答质量单独评测',
        })
        self.store.audit(user.id, 'skill.evaluate', skill_id, {'version': version, 'passed': result['passed']})
        return result

    def activate(self, user, skill_id, version):
        require_role(user, 'admin')
        package = self.get(skill_id, version)
        result = self.store.get('skill_evaluation', f'{skill_id}:{version}')
        if not result or not result['passed'] or result['digest'] != package['digest']:
            raise PolicyError('此版本尚未通过当前内容对应的回归评测。请先运行评测。')
        with self.store.transaction():
            record = self.store.put('skill', {'id': skill_id, 'active_version': version})
            self.store.audit(user.id, 'skill.activate', skill_id, {'version': version})
        return record
