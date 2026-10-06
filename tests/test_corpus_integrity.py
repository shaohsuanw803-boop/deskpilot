"""Corpus acceptance checks: scope, split leakage and secret-free fictional fixtures."""
import json
from collections import defaultdict
from pathlib import Path

from deskpilot.policy import check_outbound

ROOT = Path(__file__).resolve().parents[1]


def load_fixtures():
    catalog = json.loads((ROOT / "fixtures/knowledge/catalog.json").read_text(encoding="utf-8"))
    questions = json.loads((ROOT / "fixtures/eval/questions.json").read_text(encoding="utf-8"))
    return catalog, questions


def test_corpus_has_complete_sources_and_scope():
    catalog, _ = load_fixtures()
    assert len(catalog) == 40
    assert len({item["id"] for item in catalog}) == len(catalog)
    assert {item["file"] for item in catalog} == {p.name for p in (ROOT / "fixtures/knowledge").glob("*.md")}
    for item in catalog:
        source = (ROOT / "fixtures/knowledge" / item["file"]).read_text(encoding="utf-8")
        assert "虚构演示资料" in source
        assert len(source) > 500, item["id"]
        assert all(f"{n}. " in source for n in range(1, 5)), item["id"]
        for heading in ("适用范围", "用户现象", "判断依据", "处理步骤", "验证与完成条件", "权限与风险边界"):
            assert f"## {heading}" in source
        assert item["roles"] and item["owner"] and item["product_version"]
        if item["cloud_allowed"]:
            check_outbound(source)
    restricted = [item for item in catalog if not item["cloud_allowed"]]
    assert len(restricted) >= 2
    assert any(item.get("allowed_users") for item in restricted)
    assert any("employee" not in item["roles"] for item in restricted)


def test_evaluation_families_do_not_leak_between_splits():
    catalog, questions = load_fixtures()
    assert len(questions) == 80
    assert len({q["id"] for q in questions}) == 80
    assert len({q["query"] for q in questions}) == 80
    ids = {item["id"] for item in catalog}
    families = defaultdict(set)
    for question in questions:
        families[question["family"]].add(question["split"])
        assert set(question["expected_document_ids"]) <= ids
        assert question["expected_behavior"] in {"answer", "clarify", "abstain", "deny"}
        assert bool(question["expected_document_ids"]) == (question["expected_behavior"] == "answer")
    assert all(len(splits) == 1 for splits in families.values())
    assert {q["split"] for q in questions} == {"dev", "test"}
    assert {"exact_code", "platform", "version", "unanswerable", "ambiguity", "acl", "injection"} <= {q["category"] for q in questions}


def test_application_does_not_load_evaluation_gold_labels():
    for path in (ROOT / "backend/deskpilot").glob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "questions.json" not in source, path
        assert "expected_document_ids" not in source, path
