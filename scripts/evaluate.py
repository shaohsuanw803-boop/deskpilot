"""Run labeled retrieval evaluation against the real KnowledgeService.

Offline default never calls paid APIs. --cloud explicitly enables configured cloud
providers; missing providers are recorded as unmeasured, never replaced by BM25 scores.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
STRATEGIES = ("bm25", "dense", "hybrid", "hybrid_rerank")


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(percent * len(ordered)) - 1)], 2)


def corpus_hash(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def summarize(rows: list[dict]) -> dict:
    measured = [row for row in rows if row["measurement"] == "measured"]
    answerable = [row for row in measured if row["expected_behavior"] == "answer"]
    recall_rows = [row for row in answerable if row.get("recall_at_10") is not None]
    latencies = [row["elapsed_ms"] for row in measured]
    return {
        "status": "measured" if len(measured) == len(rows) and rows else "partial" if measured else "unmeasured",
        "cases": len(rows), "measured_cases": len(measured), "answerable_cases": len(answerable),
        "hit_at_5": round(sum(row["hit_at_5"] for row in answerable) / len(answerable), 4) if answerable else None,
        "recall_at_10": round(sum(row["recall_at_10"] for row in recall_rows) / len(recall_rows), 4) if recall_rows else None,
        "recall_measured_cases": len(recall_rows),
        "mrr_at_5": round(sum(row["reciprocal_rank"] for row in answerable) / len(answerable), 4) if answerable else None,
        "behavior_accuracy": round(sum(row["behavior_correct"] for row in measured) / len(measured), 4) if measured else None,
        "acl_violations": sum(len(row.get("unauthorized_ids", [])) for row in measured) if measured else None,
        "p50_ms": percentile(latencies, .50), "p95_ms": percentile(latencies, .95),
        "statuses": dict(Counter(row.get("observed_status", row["measurement"]) for row in rows)),
    }


def usage_totals(records: list[dict]) -> dict:
    reported = [row for row in records if row.get("usage_status") == "reported"]
    return {"calls": len(records), "reported_calls": len(reported), "unknown_calls": len(records) - len(reported),
            "reported_input_tokens": sum(row.get("input_tokens") or 0 for row in reported),
            "reported_output_tokens": sum(row.get("output_tokens") or 0 for row in reported),
            "reported_cost_cny": round(sum(row.get("actual_cny") or 0 for row in reported), 8),
            "budget_charged_cny": round(sum(row.get("charged_cny") or 0 for row in records), 8)}


def render_markdown(report: dict) -> str:
    lines = ["# DeskPilot 检索评测", "", f"- 时间（UTC）：{report['generated_at']}",
             f"- 模式：`{report['mode']}`；split：`{report['split']}`；语料 SHA256：`{report['corpus_sha256']}`",
             f"- 文档：{report['document_count']}；问题：{report['question_count']}；Python：{report['python']}",
             "- 使用实际 KnowledgeService 和新建临时数据库；没有通过 gold label 路由答案。", "",
             "| 策略 | 状态 | 已测/总数 | Hit@5 | Recall@10 | MRR@5 | 行为准确率 | ACL泄露数 | p50/p95 ms |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    def display(value):
        return "—" if value is None else str(value)
    for strategy, item in report["strategies"].items():
        lines.append(f"| {strategy} | {item['status']} | {item['measured_cases']}/{item['cases']} | "
                     f"{display(item['hit_at_5'])} | {display(item['recall_at_10'])} | {display(item['mrr_at_5'])} | {display(item['behavior_accuracy'])} | "
                     f"{display(item['acl_violations'])} | {display(item['p50_ms'])}/{display(item['p95_ms'])} |")
    lines += ["", "## 统计边界", "", "- Hit@5/MRR@5 仅计算有标准来源的 answer 问题，按文档去重；它们不是生成答案事实准确率。",
              "- Recall@10 对每个 answer 问题计算前10个实际排序文档与 gold 集合交集占 gold 集合的比例，再宏平均；缺少完整排序 trace 时记为未测。",
              "- 行为准确率比较 ready、needs_clarification、no_evidence；deny 要求没有证据返回。ACL 泄露另按服务端 can_read 检查证据和 trace 中的文档 ID。",
              "- 注入问题只衡量检索命中；是否阻止工具和数据外发由安全测试验证，本报告不把检索命中视为注入防护通过。",
              "- unmeasured 表示缺云配置或策略不可用，数值留空。partial 不可与完整评测直接比较；失败案例保留在 JSON。",
              "- 延迟是同一进程中的顺序执行实测，含查询阶段；文档导入单列，缓存可能影响后续策略，不是生产吞吐测试。",
              "- 本次只评测检索，不执行生成模型。供应商未报告 usage 的调用保持 unknown，预算预留不冒充实际账单。",
              "- dev 可用于调参；test 按 family 隔离，应在参数冻结后才用于最终验收。合成小语料结果不代表真实企业效果。", "",
              "## 用量", "", "```json", json.dumps(report["usage"], ensure_ascii=False, indent=2), "```", "",
              "## 失败与未测原因", ""]
    failures = [row for row in report["results"] if row["measurement"] != "measured" or not row.get("behavior_correct") or row.get("hit_at_5") is False]
    for row in failures[:30]:
        reason = row.get("reason") or f"status={row.get('observed_status')}; retrieved={row.get('retrieved_document_ids')}"
        lines.append(f"- `{row['strategy']}/{row['question_id']}`：{reason}")
    if len(failures) > 30:
        lines.append(f"- 其余 {len(failures) - 30} 项见配套 JSON。")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cloud", action="store_true", help="Explicitly allow configured paid cloud retrieval APIs")
    parser.add_argument("--split", choices=["dev", "test", "all"], default="dev")
    parser.add_argument("--strategies", nargs="+", choices=STRATEGIES, default=list(STRATEGIES))
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "reports" / "retrieval-baseline")
    args = parser.parse_args()
    from deskpilot.config import Settings
    from deskpilot.db import Store
    from deskpilot.policy import USERS, can_read
    from deskpilot.knowledge import KnowledgeService

    catalog_path = ROOT / "fixtures" / "knowledge" / "catalog.json"
    questions_path = ROOT / "fixtures" / "eval" / "questions.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    all_questions = json.loads(questions_path.read_text(encoding="utf-8"))
    questions = [q for q in all_questions if args.split == "all" or q["split"] == args.split]
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "mode": "cloud" if args.cloud else "demo",
              "split": args.split, "document_count": len(catalog), "question_count": len(questions),
              "python": platform.python_version(), "platform": platform.platform(),
              "corpus_sha256": corpus_hash([catalog_path, questions_path, *(ROOT / "fixtures" / "knowledge").glob("*.md")]),
              "strategies": {}, "results": [], "usage": {}}
    with tempfile.TemporaryDirectory(prefix="deskpilot-eval-") as directory:
        settings = Settings(data_dir=Path(directory), repo_root=ROOT, app_mode="cloud" if args.cloud else "demo")
        missing = settings.cloud_missing() if args.cloud else ["--cloud not enabled"]
        # With incomplete cloud credentials, seed locally and explicitly leave cloud strategies unmeasured.
        if missing:
            settings = settings.model_copy(update={"app_mode": "demo"})
        store = Store(Path(directory) / "evaluation.sqlite3")
        service = KnowledgeService(store, settings.model_copy(update={"app_mode": "demo"}))
        try:
            start = time.perf_counter()
            for item in catalog:
                document = service.ingest(item["file"], (ROOT / "fixtures" / "knowledge" / item["file"]).read_bytes(),
                                          item, USERS["admin"], document_id=item["id"])
                service.publish(document.get("id", item["id"]), USERS["admin"])
            report["local_seed_ms"] = round((time.perf_counter() - start) * 1000, 2)
            report["ingestion_failures"] = []
            service.close()
            service = KnowledgeService(store, settings)
            if settings.app_mode == "cloud":
                for item in catalog:
                    if not item.get("cloud_allowed"):
                        continue
                    try:
                        document = service.ingest(item["file"], (ROOT / "fixtures" / "knowledge" / item["file"]).read_bytes(),
                                                  item, USERS["admin"], document_id=item["id"])
                        if document.get("pending_state") != "prepared":
                            report["ingestion_failures"].append({"document_id": item["id"], "reason": "cloud_index_not_prepared"})
                            continue
                        service.publish(item["id"], USERS["admin"])
                    except Exception as exc:
                        report["ingestion_failures"].append({"document_id": item["id"], "reason": type(exc).__name__})
            report["ingestion_ms"] = round((time.perf_counter() - start) * 1000, 2)
            report["usage"]["ingestion"] = usage_totals(store.list("usage"))
            usage_before_search = len(store.list("usage"))
            for strategy in args.strategies:
                rows = []
                for question in questions:
                    row = {"strategy": strategy, "question_id": question["id"], "family": question["family"],
                           "category": question["category"], "expected_behavior": question["expected_behavior"],
                           "expected_document_ids": question["expected_document_ids"], "measurement": "unmeasured"}
                    if strategy != "bm25" and missing:
                        row["reason"] = "云配置缺失或未启用：" + ", ".join(missing)
                        rows.append(row)
                        continue
                    if strategy != "bm25" and report["ingestion_failures"]:
                        row["reason"] = "云向量索引未完整建立；保留旧本地知识，当前云策略未测。详见 ingestion_failures。"
                        rows.append(row)
                        continue
                    start = time.perf_counter()
                    try:
                        result = service.search(question["query"], USERS[question["user_id"]],
                                                run_id=f"eval-{strategy}-{question['id']}", strategy=strategy)
                        trace = result.get("trace", {})
                        row["elapsed_ms"] = round((time.perf_counter() - start) * 1000, 2)
                        if trace.get("strategy_unavailable") or result.get("status") == "degraded":
                            row["reason"] = "策略未完整执行，降级结果不计入该策略：" + str(trace.get("reason", result.get("status")))
                            rows.append(row)
                            continue
                        evidence = result.get("evidence", [])
                        ranked = trace.get("ranked_document_ids")
                        ordered = list(dict.fromkeys(ranked if ranked is not None else [e["document_id"] for e in evidence]))
                        retrieved = ordered[:5]
                        expected = set(question["expected_document_ids"])
                        rank = next((n for n, doc in enumerate(retrieved, 1) if doc in expected), None)
                        examined = set(e["document_id"] for e in evidence) | set(trace.get("candidate_ids", [])) | set(ordered)
                        unauthorized = [doc for doc in examined if (store.get("document", doc) is None or
                                        not can_read(USERS[question["user_id"]], store.get("document", doc)))]
                        status = result.get("status")
                        expected_behavior = question["expected_behavior"]
                        correct = {"answer": status == "ready" and bool(evidence),
                                   "clarify": status == "needs_clarification",
                                   "abstain": status == "no_evidence" and not evidence,
                                   "deny": status == "no_evidence" and not evidence}[expected_behavior]
                        row.update(measurement="measured", observed_status=status, retrieved_document_ids=retrieved,
                                   hit_at_5=bool(rank) if expected else None, reciprocal_rank=1 / rank if rank else 0,
                                   recall_at_10=len(set(ordered[:10]) & expected) / len(expected) if expected and ranked is not None else None,
                                   ranked_document_ids_at_10=ordered[:10] if ranked is not None else None,
                                   behavior_correct=correct and not unauthorized, unauthorized_ids=sorted(unauthorized),
                                   trace=trace)
                    except Exception as exc:
                        # Never turn a failed provider or service call into a numeric zero score.
                        row.update(measurement="failed", reason=f"{type(exc).__name__}: evaluation call failed",
                                   elapsed_ms=round((time.perf_counter() - start) * 1000, 2))
                    rows.append(row)
                report["results"].extend(rows)
                report["strategies"][strategy] = summarize(rows)
            report["usage"]["retrieval"] = usage_totals(store.list("usage")[usage_before_search:])
            report["usage"]["total"] = usage_totals(store.list("usage"))
        finally:
            service.close()
            store.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    args.output.with_suffix(".md").write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps(report["strategies"], ensure_ascii=False, indent=2))
    print(f"Reports: {args.output.with_suffix('.json')} and {args.output.with_suffix('.md')}")
    return 1 if any(r["measurement"] == "failed" for r in report["results"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
