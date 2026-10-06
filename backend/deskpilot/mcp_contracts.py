"""Repository-reviewed MCP contracts. Server descriptions never grant authority."""
import hashlib
import json

from jsonschema import Draft202012Validator

from .policy import PolicyError


def object_schema(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}


SERVICE = {'type': 'string', 'enum': ['vpn', 'office', 'identity']}
CONTRACTS = {
    'service_status': {
        'name': 'service_status',
        'description': '查询一个服务的当前状态，只读。',
        'inputSchema': object_schema({'service': SERVICE}),
        'outputSchema': object_schema({
            'service': SERVICE, 'status': {'type': 'string', 'enum': ['operational', 'degraded', 'outage']},
            'summary': {'type': 'string', 'maxLength': 500},
            'observed_at': {'type': 'string', 'maxLength': 64}, 'simulated': {'type': 'boolean'}}),
    },
    'asset_lookup': {
        'name': 'asset_lookup',
        'description': '查询调用者绑定的设备概况，只读。',
        'inputSchema': object_schema({'user_id': {'type': 'string', 'maxLength': 64}}),
        'outputSchema': object_schema({
            'user_id': {'type': 'string', 'maxLength': 64},
            'device': {'type': 'string', 'maxLength': 120}, 'os': {'type': 'string', 'maxLength': 120},
            'managed': {'type': 'boolean'}, 'simulated': {'type': 'boolean'}}),
    },
}


def digest(descriptor):
    contract = {key: descriptor.get(key) for key in ('name', 'inputSchema', 'outputSchema')}
    return hashlib.sha256(json.dumps(contract, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify_descriptor(tool, descriptor):
    if digest(descriptor) != digest(CONTRACTS[tool]):
        raise PolicyError('MCP 工具契约发生变化；维护人审核并更新本地契约后才能恢复调用。')


def validate(schema, value):
    # Do not propagate jsonschema's exception: it includes raw instance values.
    if not Draft202012Validator(schema).is_valid(value):
        raise PolicyError('MCP 参数或结果不符合审核契约。')
