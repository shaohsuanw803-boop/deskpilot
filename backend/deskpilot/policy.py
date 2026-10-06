"""Deterministic authorization and egress controls, outside model prompts."""
import re
from dataclasses import asdict, dataclass

POLICY_VERSION = '1.0.0'


class PolicyError(ValueError):
    pass


@dataclass(frozen=True)
class User:
    id: str
    name: str
    role: str
    department: str

    def as_dict(self):
        english = {'alice': ('Alice Lin', 'Product'), 'bob': ('Bob Zhou', 'Finance'),
                   'chen': ('Chen', 'IT Helpdesk'), 'admin': ('Administrator', 'IT Helpdesk')}
        name, department = english.get(self.id, (self.name, self.department))
        return {**asdict(self), 'name_en': name, 'department_en': department}


USERS = {
    'alice': User('alice', '林晓', 'employee', '产品部'),
    'bob': User('bob', '周宁', 'employee', '财务部'),
    'chen': User('chen', '陈工', 'it', 'IT 服务台'),
    'admin': User('admin', '管理员', 'admin', 'IT 服务台'),
}


def require_role(user: User, *roles: str):
    if user.role not in roles:
        raise PolicyError('当前身份没有执行此操作的权限。')


def can_read(user: User, document: dict) -> bool:
    if document.get('status') not in ('published',) and not document.get('active_version'):
        return False
    if document.get('status') in ('withdrawn', 'deleted'):
        return False
    roles = document.get('roles', ['employee', 'it', 'admin'])
    users = document.get('allowed_users') or []
    return user.role in roles and (not users or user.id in users)


SECRET_RE = re.compile(
    r'(?:sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{12,}|'
    r'(?:api[_-]?key|password|passwd|secret|token|密码|密钥)\s*[:=：]\s*[^\s,;，；]{5,}|'
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)', re.I)
SENSITIVE_KEYS = re.compile(r'^(api.?key|password|passwd|secret|authorization|cookie|token)$', re.I)


def redact(value):
    if isinstance(value, dict):
        return {key: '[REDACTED]' if SENSITIVE_KEYS.match(str(key)) else redact(item)
                for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return SECRET_RE.sub('[REDACTED]', value)
    return value


def check_outbound(texts):
    """Defense in depth, not a general-purpose DLP classifier."""
    if isinstance(texts, str):
        texts = [texts]
    for text in texts:
        if SECRET_RE.search(str(text)):
            raise PolicyError('检测到凭据或密钥样式的内容，已阻止云端发送。请先脱敏。')


def own_or_staff(user: User, item: dict, field='user_id'):
    if user.role not in ('it', 'admin') and item.get(field) != user.id:
        raise PolicyError('无权访问此记录。')
