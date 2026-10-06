import pytest

from deskpilot.db import Store
from deskpilot.policy import USERS, PolicyError, can_read, check_outbound


def test_transaction_rolls_back_business_change_and_receipt(tmp_path):
    db = Store(tmp_path / 'app.db')
    with pytest.raises(RuntimeError):
        with db.transaction():
            db.put('grant', {'id': 'operation-1'})
            db.put('receipt', {'id': 'operation-1'})
            raise RuntimeError('process failed before commit')
    assert db.get('grant', 'operation-1') is None
    assert db.get('receipt', 'operation-1') is None
    db.close()


def test_metadata_acl_and_withdrawal_are_authoritative():
    doc = {'status': 'published', 'roles': ['employee'], 'allowed_users': ['alice']}
    assert can_read(USERS['alice'], doc)
    assert not can_read(USERS['bob'], doc)
    doc['status'] = 'withdrawn'
    assert not can_read(USERS['alice'], doc)


def test_secret_material_cannot_be_sent_to_cloud():
    with pytest.raises(PolicyError):
        check_outbound(['请查这个问题', 'API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456'])


def test_audit_masks_secrets(tmp_path):
    db = Store(tmp_path / 'app.db')
    db.audit('alice', 'test', 'ticket', {'api_key': 'secret-value', 'description': 'Bearer abcdefghijklmnop'})
    event = db.list('audit')[0]
    assert 'secret-value' not in str(event)
    assert 'abcdefghijklmnop' not in str(event)
    db.close()
