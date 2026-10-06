import pytest

from deskpilot.config import Settings
from deskpilot.db import Store
from deskpilot.policy import USERS, PolicyError
from deskpilot.workflow import DeskService, approval_digest


class FakeKnowledge:
    def __init__(self):
        self.contexts = []
        self.withdrawn = False

    def answer(self, query, user, run_id, context=None):
        self.contexts.append(context)
        return {'answer': '请按照文档检查网络 [doc:1]', 'status': 'completed',
                'citations': [{'id': 'doc:1', 'document_id': 'doc', 'cloud_allowed': True}],
                'retrieval': {'query': query, 'mode': 'bm25'}}

    def get_source(self, chunk_id, user):
        if self.withdrawn:
            raise PolicyError('已撤回')
        return {'id': chunk_id, 'text': '正常内容', 'cloud_allowed': True}


@pytest.fixture
def setup(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Store(tmp_path / 'app.db')
    rag = FakeKnowledge()
    service = DeskService(store, settings, rag)
    yield service, store, rag
    service.close()
    store.close()


def test_permission_request_interrupts_and_cannot_self_approve(setup):
    service, store, _ = setup
    run = service.run(USERS['alice'], '申请 Figma 软件权限')
    assert run['status'] == 'awaiting_approval'
    assert not store.list('grant')
    with pytest.raises(PolicyError):
        service.decide(USERS['alice'], run['approval_id'], 'approve')
    service.decide(USERS['chen'], run['approval_id'], 'approve')
    assert len(store.list('grant')) == 1
    service.decide(USERS['chen'], run['approval_id'], 'approve')
    assert len(store.list('grant')) == 1


def test_parameter_tampering_invalidates_approval(setup):
    service, store, _ = setup
    run = service.run(USERS['alice'], '申请 Figma 软件权限')
    approval = store.get('approval', run['approval_id'])
    approval['parameters']['application'] = 'root-shell'
    store.put('approval', approval)
    with pytest.raises(PolicyError):
        service.decide(USERS['chen'], approval['id'], 'approve')
    assert not store.list('grant')


def test_pending_run_can_resume_after_service_restart(setup):
    service, store, rag = setup
    run = service.run(USERS['alice'], '申请 Visio 软件权限')
    service.close()
    replacement = DeskService(store, service.settings, rag)
    result = replacement.decide(USERS['chen'], run['approval_id'], 'approve')
    assert result['status'] == 'consumed'
    assert store.get('run', run['id'])['status'] == 'completed'
    replacement.close()


def test_restart_after_effect_before_checkpoint_does_not_repeat_grant(tmp_path):
    class CrashAfterEffect(DeskService):
        def _execute(self, state):
            super()._execute(state)
            raise RuntimeError('simulated crash after transaction, before checkpoint')

    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Store(tmp_path / 'app.db')
    first = CrashAfterEffect(store, settings, FakeKnowledge())
    run = first.run(USERS['alice'], '申请 Figma 权限')
    with pytest.raises(RuntimeError):
        first.decide(USERS['chen'], run['approval_id'], 'approve')
    assert len(store.list('grant')) == 1
    first.close()
    restarted = DeskService(store, settings, FakeKnowledge())
    restarted.recover()
    assert len(store.list('grant')) == 1
    assert store.get('run', run['id'])['status'] == 'completed'
    restarted.close()
    store.close()


def test_withdrawn_source_not_reused_as_history(setup):
    service, _, rag = setup
    run = service.run(USERS['alice'], 'VPN 809 怎么解决')
    rag.withdrawn = True
    service.run(USERS['alice'], '继续处理', thread_id=run['thread_id'])
    assert all('请按照文档' not in m['content'] for m in rag.contexts[-1]['messages'])


def test_cross_user_thread_reuse_denied(setup):
    service, _, _ = setup
    run = service.run(USERS['alice'], 'VPN 809')
    with pytest.raises(PolicyError):
        service.run(USERS['bob'], '继续处理', thread_id=run['thread_id'])


def test_memory_requires_confirmation_and_is_private(setup):
    service, _, _ = setup
    with pytest.raises(PolicyError):
        service.save_memory(USERS['alice'], '我用 Windows 11', False)
    memory = service.save_memory(USERS['alice'], '我用 Windows 11', True)
    assert not service.memories(USERS['bob'])
    service.delete_memory(USERS['alice'], memory['id'])
    assert not service.memories(USERS['alice'])


def test_long_conversation_retains_initial_issue_and_reported_progress(setup):
    service, _, rag = setup
    first = service.run(USERS['alice'], 'Windows 11 VPN 809 无法连接')
    service.run(USERS['alice'], '已经重启电脑，错误仍然存在', thread_id=first['thread_id'])
    for _ in range(6):
        service.run(USERS['alice'], '继续处理', thread_id=first['thread_id'])
    task = rag.contexts[-1]['task']
    assert 'VPN 809' in task['initial_request']
    assert any('已经重启' in step for step in task['reported_progress'])
    rag.withdrawn = True
    service.run(USERS['alice'], '继续处理', thread_id=first['thread_id'])
    assert not rag.contexts[-1]['task'].get('initial_request')


def test_deleted_preference_invalidates_dependent_history(setup):
    service, _, rag = setup
    memory = service.save_memory(USERS['alice'], '称呼我为测试昵称', True)
    first = service.run(USERS['alice'], 'VPN 809')
    service.delete_memory(USERS['alice'], memory['id'])
    service.run(USERS['alice'], '继续处理', thread_id=first['thread_id'])
    assert not rag.contexts[-1]['preferences']
    assert not rag.contexts[-1]['messages']


def test_recovery_of_expired_committed_approval_is_terminal(setup):
    service, store, _ = setup
    run = service.run(USERS['alice'], '申请 Figma 权限')
    approval = store.get('approval', run['approval_id'])
    approval.update(status='approved', approved_by='chen', expires_at='2000-01-01T00:00:00+00:00')
    approval['digest'] = approval_digest(approval)
    store.put('approval', approval)
    service.recover()
    assert store.get('run', run['id'])['status'] == 'failed'
    assert not store.list('grant')
