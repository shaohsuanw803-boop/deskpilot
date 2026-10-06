"""Keep retrieval metrics and unknown provider usage honest."""
import importlib.util
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/evaluate.py"
SPEC = importlib.util.spec_from_file_location("deskpilot_evaluation", SCRIPT)
evaluation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluation)


def test_metrics_macro_average_recall_only_over_answerable_cases():
    first = {"measurement": "measured", "expected_behavior": "answer", "elapsed_ms": 20,
             "hit_at_5": True, "recall_at_10": .5, "reciprocal_rank": 1,
             "behavior_correct": True, "unauthorized_ids": []}
    second = {**first, "recall_at_10": 1, "reciprocal_rank": .5}
    clarification = {**first, "expected_behavior": "clarify", "recall_at_10": None}
    summary = evaluation.summarize([first, second, clarification])
    assert summary["answerable_cases"] == 2
    assert summary["recall_at_10"] == .75
    assert summary["mrr_at_5"] == .75
    assert summary["recall_measured_cases"] == 2


def test_unmeasured_strategy_does_not_claim_zero_cost_or_zero_acl_violations():
    summary = evaluation.summarize([{"measurement": "unmeasured", "expected_behavior": "answer"}])
    assert summary["status"] == "unmeasured"
    assert summary["hit_at_5"] is None
    assert summary["recall_at_10"] is None
    assert summary["acl_violations"] is None
    assert summary["p50_ms"] is None


def test_budget_reserve_is_not_reported_as_actual_provider_cost():
    totals = evaluation.usage_totals([
        {"usage_status": "unknown", "charged_cny": .25, "actual_cny": None},
        {"usage_status": "reported", "input_tokens": 100, "output_tokens": 20,
         "actual_cny": .001, "charged_cny": .001},
    ])
    assert totals["unknown_calls"] == 1
    assert totals["reported_cost_cny"] == .001
    assert totals["budget_charged_cny"] == .251
    assert totals["reported_input_tokens"] == 100


def test_failed_cloud_index_is_reported_without_replacing_it_with_local_scores(tmp_path, monkeypatch):
    from deskpilot.providers import ProviderError, ProviderGateway

    knowledge = tmp_path / "fixtures" / "knowledge"
    labeled = tmp_path / "fixtures" / "eval"
    knowledge.mkdir(parents=True)
    labeled.mkdir(parents=True)
    (knowledge / "sample.md").write_text("# VPN 809\n\n虚构演示资料。连接超时请记录网络类型。", encoding="utf-8")
    catalog = [{"id": "sample", "file": "sample.md", "title": "VPN 809", "product": "VPN",
                "product_version": "5.2", "owner": "IT", "roles": ["employee", "it", "admin"], "cloud_allowed": True}]
    question = {"id": "sample-1", "family": "sample", "split": "dev", "query": "VPN 809",
                "user_id": "alice", "expected_document_ids": ["sample"], "expected_behavior": "answer", "category": "exact_code"}
    (knowledge / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    (labeled / "questions.json").write_text(json.dumps([question]), encoding="utf-8")
    monkeypatch.setattr(evaluation, "ROOT", tmp_path)
    for name in ("LLM_BASE_URL", "EMBEDDING_BASE_URL", "RERANK_ENDPOINT"):
        monkeypatch.setenv(name, "https://example.invalid/v1")
    for name in ("LLM_API_KEY", "EMBEDDING_API_KEY", "RERANK_API_KEY"):
        monkeypatch.setenv(name, "fake-test-key")
    for name in ("LLM_INPUT_CNY_PER_MILLION", "LLM_OUTPUT_CNY_PER_MILLION", "EMBEDDING_CNY_PER_MILLION", "RERANK_CNY_PER_MILLION"):
        monkeypatch.setenv(name, "1")
    monkeypatch.setenv("LLM_MODEL", "test-qwen")
    monkeypatch.setenv("PRICE_AS_OF", "2026-09-29")

    def unavailable(*args, **kwargs):
        raise ProviderError("simulated cloud outage")

    monkeypatch.setattr(ProviderGateway, "embeddings", unavailable)
    output = tmp_path / "report"
    monkeypatch.setattr(evaluation.sys, "argv", ["evaluate.py", "--cloud", "--strategies", "dense", "--output", str(output)])
    assert evaluation.main() == 0
    report = json.loads(output.with_suffix(".json").read_text(encoding="utf-8"))
    assert report["ingestion_failures"]
    assert report["strategies"]["dense"]["status"] == "unmeasured"
    assert report["strategies"]["dense"]["recall_at_10"] is None
