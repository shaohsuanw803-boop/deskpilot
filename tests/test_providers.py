"""Contract tests use HTTP transport mocks, never paid provider calls."""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest

from deskpilot.db import Store
from deskpilot.providers import ProviderGateway, ProviderError, BudgetExceeded
from deskpilot.policy import PolicyError


def settings(**overrides):
    values = dict(app_mode="cloud", llm_base_url="https://qwen.test/compatible-mode/v1",
        llm_api_key="test-key", llm_model="qwen-plus",
        embedding_base_url="https://qwen.test/compatible-mode/v1", embedding_api_key="test-key",
        embedding_model="text-embedding-v4", embedding_dimensions=1024,
        rerank_endpoint="https://qwen.test/compatible-api/v1/reranks", rerank_api_key="test-key",
        rerank_model="qwen3-rerank", max_run_cost_cny=.5, max_daily_cost_cny=10,
        max_retries=2, request_timeout_seconds=1, llm_input_cny_per_million=1,
        llm_output_cny_per_million=2, embedding_cny_per_million=.5,
        rerank_cny_per_million=1, price_as_of="2026-09-29")
    values.update(overrides)
    return SimpleNamespace(**values)


def gateway(tmp_path, handler, **overrides):
    store = Store(tmp_path / "test.db")
    return ProviderGateway(store, settings(**overrides), client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_embedding_batches_at_ten_and_preserves_provider_order(tmp_path):
    batches = []
    def handle(request):
        payload = json.loads(request.content)
        assert request.url.path.endswith("/embeddings")
        assert payload["dimensions"] == 1024
        batches.append(payload["input"])
        return httpx.Response(200, json={"data": [
            {"index": i, "embedding": [float(i)] * 1024} for i in reversed(range(len(payload["input"])))],
            "usage": {"total_tokens": 50}})
    api = gateway(tmp_path, handle)
    vectors = api.embeddings([f"text {i}" for i in range(12)], "run")
    assert list(map(len, batches)) == [10, 2]
    assert [v[0] for v in vectors] == list(range(10)) + [0, 1]


def test_rerank_uses_qwen3_flat_json_and_results(tmp_path):
    def handle(request):
        body = json.loads(request.content)
        assert request.url.path == "/compatible-api/v1/reranks"
        assert body == {"model": "qwen3-rerank", "query": "VPN", "documents": ["one", "two"], "top_n": 2}
        return httpx.Response(200, json={"results": [{"index": 1, "relevance_score": .9}], "usage": {"total_tokens": 9}})
    assert gateway(tmp_path, handle).rerank("VPN", ["one", "two"], "run", top_n=2)[0]["index"] == 1


def test_unknown_usage_stays_unknown_and_reservation_is_charged(tmp_path):
    api = gateway(tmp_path, lambda req: httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}))
    assert api.chat([{"role": "user", "content": "hello"}], "run") == "ok"
    record = api.store.list("usage")[0]
    assert record["actual_cny"] is None
    assert record["usage_status"] == "unknown"
    assert record["charged_cny"] > 0


def test_each_retry_is_reserved_and_charged(tmp_path):
    attempts = []
    def handle(req):
        attempts.append(1)
        return httpx.Response(503, json={"error": "unavailable"})
    api = gateway(tmp_path, handle)
    with pytest.raises(ProviderError):
        api.chat([{"role": "user", "content": "hello"}], "run")
    assert len(attempts) == 3
    assert len(api.store.list("usage")) == 3
    assert all(x["usage_status"] == "unknown" for x in api.store.list("usage"))


def test_budget_rejects_before_request_and_secret_never_sent(tmp_path):
    requests = []
    api = gateway(tmp_path, lambda req: requests.append(req), max_run_cost_cny=.0000001)
    with pytest.raises(BudgetExceeded):
        api.embeddings(["hello"], "run")
    assert not requests
    with pytest.raises(ValueError):
        api.embeddings(["api_key=sk-abcdefghijklmnopqrstuvwxyz123456"], "secret")
    assert not requests


def test_demo_never_calls_http(tmp_path):
    api = gateway(tmp_path, lambda req: pytest.fail("demo called HTTP"), app_mode="demo")
    with pytest.raises(ProviderError, match="demo"):
        api.embeddings(["test"], "run")


def test_bad_vector_and_bad_rerank_index_rejected(tmp_path):
    api = gateway(tmp_path, lambda req: httpx.Response(200, json={"data": [{"index": 0, "embedding": [1.0]}], "usage": {"total_tokens": 2}}))
    with pytest.raises(ProviderError, match="dimension"):
        api.embeddings(["test"], "run")
    api.client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"results": [{"index": 5, "relevance_score": .8}]})))
    with pytest.raises(ProviderError):
        api.rerank("q", ["d"], "run")


def test_concurrent_reservations_enforce_run_limit(tmp_path):
    api = gateway(tmp_path, lambda req: httpx.Response(200, json={}), max_run_cost_cny=.01)
    def reserve(_):
        try:
            return api._reserve("embedding", "shared", 12000, 0, "model")
        except BudgetExceeded:
            return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        records = list(pool.map(reserve, range(8)))
    assert sum(record is not None for record in records) == 1
    assert sum(r["charged_cny"] for r in api.store.list("usage")) <= .01


def test_chat_total_tokens_without_breakdown_remains_unknown(tmp_path):
    api = gateway(tmp_path, lambda req: httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}],
        "usage": {"total_tokens": 10, "completion_tokens": 4}}))
    api.chat([{"role": "user", "content": "hello"}], "run")
    assert api.store.list("usage")[0]["usage_status"] == "unknown"


def test_expired_run_deadline_stops_before_budget_or_network(tmp_path):
    api = gateway(tmp_path, lambda req: pytest.fail("expired run sent HTTP"))
    api.store.put("run", {"id": "run", "deadline_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
    with pytest.raises(ProviderError, match="超时"):
        api.chat([{"role": "user", "content": "hello"}], "run")
    assert not api.store.list("usage")


def test_http_timeout_is_limited_to_remaining_run_time(tmp_path):
    def handle(request):
        assert 0 < request.extensions["timeout"]["read"] < .5
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})
    api = gateway(tmp_path, handle)
    api.store.put("run", {"id": "run", "deadline_at": (datetime.now(timezone.utc) + timedelta(seconds=.5)).isoformat()})
    assert api.chat([{"role": "user", "content": "hello"}], "run") == "ok"


def test_authorization_is_rechecked_before_retry(tmp_path):
    permission = {"allowed": True}
    calls = []
    def authorize():
        if not permission["allowed"]:
            raise PolicyError("revoked")
    def handle(request):
        calls.append(request)
        permission["allowed"] = False
        return httpx.Response(503)
    api = gateway(tmp_path, handle)
    with pytest.raises(PolicyError, match="revoked"):
        api.chat([{"role": "user", "content": "hello"}], "run", authorize=authorize)
    assert len(calls) == 1
    assert len(api.store.list("usage")) == 1


def test_revocation_during_reservation_releases_unsent_charge(tmp_path):
    permission = {"allowed": True}
    def authorize():
        if not permission["allowed"]:
            raise PolicyError("revoked")
    api = gateway(tmp_path, lambda request: pytest.fail("revoked request was sent"))
    original = api._reserve
    def reserve(*args, **kwargs):
        record = original(*args, **kwargs)
        permission["allowed"] = False
        return record
    api._reserve = reserve
    with pytest.raises(PolicyError):
        api.chat([{"role": "user", "content": "hello"}], "run", authorize=authorize)
    record = api.store.list("usage")[0]
    assert record["usage_status"] == "not_sent"
    assert record["charged_cny"] == 0
    assert record["actual_cny"] == 0
