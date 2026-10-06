"""Request retries must not duplicate a durable task or its paid workflow."""
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Barrier

import pytest

from deskpilot.config import Settings
from deskpilot.db import Store
from deskpilot.policy import USERS, PolicyError
from deskpilot.workflow import DeskService


class CountingKnowledge:
    def __init__(self):
        self.calls = 0

    def answer(self, query, user, run_id, context=None):
        self.calls += 1
        return {'answer': 'A local test answer.', 'status': 'completed', 'citations': [], 'retrieval': {}}


@pytest.fixture
def service(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Store(tmp_path / 'app.db')
    instance = DeskService(store, settings, CountingKnowledge())
    yield instance
    instance.close()
    store.close()


def test_repeated_submission_reuses_task_and_does_not_repeat_retrieval(service):
    arguments = {'message': 'VPN E809 on Windows 11', 'idempotency_key': 'request-123'}
    first = service.run(USERS['alice'], **arguments)
    second = service.run(USERS['alice'], **arguments)
    assert second['id'] == first['id']
    assert service.knowledge.calls == 1
    assert len(service.store.list('run')) == 1
    assert len(service.store.list('thread')) == 1


def test_replay_returns_current_approval_result_instead_of_cached_answer(service):
    arguments = {'message': 'Request Figma access', 'idempotency_key': 'approval-request'}
    first = service.run(USERS['alice'], **arguments)
    service.decide(USERS['chen'], first['approval_id'], 'approve')
    replayed = service.run(USERS['alice'], **arguments)
    assert replayed['id'] == first['id']
    assert replayed['status'] == 'completed'
    assert replayed['answer'] != first['answer']
    assert len(service.store.list('approval')) == 1
    assert len(service.store.list('grant')) == 1


@pytest.mark.parametrize('changed', [
    {'message': 'VPN E691'}, {'thread_id': 'a-different-thread'}, {'ticket_id': 'a-different-ticket'},
    {'cloud_allowed': False}, {'mcp_server': 'demo-it'}, {'locale': 'zh-CN'},
])
def test_reusing_key_with_any_changed_payload_is_a_conflict(service, changed):
    arguments = {'message': 'VPN E809', 'idempotency_key': 'request-conflict'}
    service.run(USERS['alice'], **arguments)
    with pytest.raises(ValueError, match='different request') as raised:
        service.run(USERS['alice'], **(arguments | changed))
    assert type(raised.value).__name__ == 'IdempotencyConflict'
    assert service.knowledge.calls == 1
    assert len(service.store.list('run')) == 1


def test_same_key_is_isolated_between_users(service):
    arguments = {'message': 'VPN E809', 'idempotency_key': 'shared-client-key'}
    first = service.run(USERS['alice'], **arguments)
    other = service.run(USERS['bob'], **arguments)
    assert first['id'] != other['id']
    assert service.run(USERS['alice'], **arguments)['id'] == first['id']
    assert service.run(USERS['bob'], **arguments)['id'] == other['id']
    assert service.knowledge.calls == 2


def test_concurrent_retries_execute_the_workflow_once(service):
    start = Barrier(4)

    def submit():
        start.wait(timeout=5)
        return service.run(USERS['alice'], 'VPN E809', idempotency_key='concurrent-request')

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: submit(), range(4)))
    assert len({run['id'] for run in results}) == 1
    assert service.knowledge.calls == 1
    assert len(service.store.list('run_request')) == 1


def test_replay_survives_closing_and_reopening_the_database(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Store(tmp_path / 'app.db')
    first_service = DeskService(store, settings, CountingKnowledge())
    arguments = {'message': 'VPN E809', 'idempotency_key': 'durable-request'}
    first = first_service.run(USERS['alice'], **arguments)
    first_service.close()
    store.close()
    reopened_store = Store(tmp_path / 'app.db')
    replacement = DeskService(reopened_store, settings, CountingKnowledge())
    try:
        replacement.recover()
        assert replacement.run(USERS['alice'], **arguments)['id'] == first['id']
        assert replacement.knowledge.calls == 0
    finally:
        replacement.close()
        reopened_store.close()


def test_crash_before_first_checkpoint_does_not_reexecute_on_retry(service, monkeypatch):
    def crash(*args, **kwargs):
        raise SystemExit('simulated process crash before first checkpoint')

    monkeypatch.setattr(service.graph, 'invoke', crash)
    arguments = {'message': 'VPN E809', 'idempotency_key': 'interrupted-request'}
    with pytest.raises(SystemExit):
        service.run(USERS['alice'], **arguments)
    first = service.store.list('run')[0]
    assert first['status'] == 'running'
    assert service.run(USERS['alice'], **arguments)['id'] == first['id']
    service.close()
    replacement = DeskService(service.store, service.settings, service.knowledge)
    try:
        replacement.recover()
        replayed = replacement.run(USERS['alice'], **arguments)
        assert replayed['id'] == first['id']
        assert replayed['status'] == 'failed'
        assert service.knowledge.calls == 0
        assert len(service.store.list('run')) == 1
    finally:
        replacement.close()


def test_failed_task_is_returned_without_silently_retrying_work(service, monkeypatch):
    def fail(*args, **kwargs):
        service.knowledge.calls += 1
        raise RuntimeError('provider failed')

    monkeypatch.setattr(service.knowledge, 'answer', fail)
    arguments = {'message': 'VPN E809', 'idempotency_key': 'failed-request'}
    first = service.run(USERS['alice'], **arguments)
    assert first['status'] == 'failed'
    assert service.run(USERS['alice'], **arguments)['id'] == first['id']
    assert service.knowledge.calls == 1


def test_requests_without_a_key_keep_existing_new_task_behavior(service):
    first = service.run(USERS['alice'], 'VPN E809')
    second = service.run(USERS['alice'], 'VPN E809')
    assert first['id'] != second['id']
    assert service.knowledge.calls == 2
    assert not service.store.list('run_request')


@pytest.mark.parametrize('key', ['', ' ', 'has space', 'new\nline', 'tab\tkey', 'key\x7f', '中文', 'x' * 129, 12])
def test_invalid_keys_are_rejected_without_echoing_or_persisting_them(service, key):
    with pytest.raises(ValueError, match='Idempotency-Key'):
        service.run(USERS['alice'], 'VPN E809', idempotency_key=key)
    assert not service.store.list('run')
    assert not service.store.list('run_request')


def test_receipt_contains_a_hash_and_reference_but_no_raw_key_or_answer(service):
    key = 'private-client-correlation-value'
    run = service.run(USERS['alice'], 'VPN E809', idempotency_key=key)
    receipts = service.store.list('run_request')
    assert len(receipts) == 1
    assert key not in json.dumps(receipts)
    assert receipts[0]['run_id'] == run['id']
    assert receipts[0]['status'] == 'accepted'
    assert 'answer' not in receipts[0]


def test_task_and_receipt_are_rolled_back_together_on_storage_failure(service, monkeypatch):
    original = service.store.put

    def fail_receipt(kind, item):
        if kind == 'run_request':
            raise RuntimeError('simulated disk write failure')
        return original(kind, item)

    monkeypatch.setattr(service.store, 'put', fail_receipt)
    with pytest.raises(RuntimeError):
        service.run(USERS['alice'], 'VPN E809', idempotency_key='atomic-request')
    assert not service.store.list('run')
    assert not service.store.list('thread')
    assert not service.store.list('run_request')
    assert service.knowledge.calls == 0


def test_missing_task_for_existing_receipt_fails_closed(service):
    arguments = {'message': 'VPN E809', 'idempotency_key': 'missing-task'}
    first = service.run(USERS['alice'], **arguments)
    service.store.delete('run', first['id'])
    with pytest.raises(ValueError, match='unavailable') as raised:
        service.run(USERS['alice'], **arguments)
    assert type(raised.value).__name__ == 'IdempotencyConflict'
    assert service.knowledge.calls == 1


def test_new_key_does_not_bypass_thread_or_ticket_ownership(service):
    first = service.run(USERS['alice'], 'VPN E809', idempotency_key='owned-thread')
    with pytest.raises(PolicyError):
        service.run(USERS['bob'], 'Continue', thread_id=first['thread_id'], idempotency_key='intruding-thread')
    service.store.put('ticket', {'id': 'owned-ticket', 'owner_id': 'alice'})
    with pytest.raises(PolicyError):
        service.run(USERS['bob'], 'Continue', ticket_id='owned-ticket', idempotency_key='intruding-ticket')
    assert len(service.store.list('run')) == 1
    assert len(service.store.list('run_request')) == 1
