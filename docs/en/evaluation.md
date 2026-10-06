# Evaluation methodology

[Project README](../../README.md) · [中文版](../evaluation.md)

The corpus contains 40 explicitly fictional Chinese IT documents. The 80 questions form 40 families with two phrasings per family. Development and test each contain 20 families, with no family crossing splits. `scripts/build_fixtures.py` rebuilds versioned fixtures only; it never participates in online retrieval.

## Reproducible runs

```bash
python scripts/evaluate.py --split dev
python scripts/evaluate.py --split test --output docs/reports/local-test
# Explicit opt-in to paid cloud retrieval:
python scripts/evaluate.py --cloud --split test --output docs/reports/cloud-test
```

Evaluation creates a temporary database, imports fixtures through the real ingestion and publication interfaces, and calls `KnowledgeService.search`. It does not read or modify the application's user-data directory. Reports include corpus hash, runtime, platform, Python version, and per-question results.

The four strategies are `bm25`, `dense`, `hybrid`, and `hybrid_rerank`. Default local runs measure only BM25 and label the others `unmeasured`. Failed or degraded cloud calls are not successful cloud-strategy executions. BM25 scores never fill missing cloud results. `partial` means some questions did not complete the selected strategy; do not compare it directly with a fully executed strategy.

## Metrics and denominators

| Metric | Denominator or definition | What it does not establish |
|---|---|---|
| Hit@5 | Among `answer` questions with gold sources, whether any gold source appears in the top five deduplicated documents | Complete multi-passage support or final-answer correctness |
| Recall@10 | For each question, intersection of the top ten actually ranked documents and gold sources, divided by gold-source count; macro-averaged over `answer` questions | Not equivalent to Hit@5; unmeasured when ranking traces are unavailable |
| MRR@5 | Reciprocal rank of the first relevant document on the same denominator; zero for no hit | Quality of all later sources |
| Behavior accuracy | Matching `answer/clarify/abstain/deny` status across fully executed questions | A human semantic-quality score |
| ACL leak count | Documents in evidence or candidate traces that fail server-side authorization checks | Every bypass or production security risk |
| p50/p95 | Sequential local query wall-clock latency, with ingestion reported separately | Concurrent load performance; results depend on caches and network conditions |
| Reported tokens / cost | Calls for which the provider actually reported usage | Unknown calls are not zero; this is not the final provider invoice |

This stage does not call a generation model for evaluation and therefore does not report factual answer accuracy. Injection-themed questions evaluate which safe knowledge should be retrieved. Actual prompt injection, unauthorized tools, and sensitive-data egress are covered by independent behavioral tests.

The interface now defaults to English with an explicit Chinese switch. This does not translate the evaluation corpus or establish multilingual quality. Bounded English demo-intent tests and language-switch regressions must be described separately from measured Chinese-corpus retrieval scores.

## Prevent evaluation contamination

- Gold labels are read only from `fixtures/eval` and evaluation scripts. Application code must not import `questions.json`.
- Tune tokenization, chunking, fusion, candidate counts, and thresholds on development data first. Record changes and model/price versions.
- Freeze parameters before evaluating test data. Do not add a bespoke keyword route for one test question. Generalize the failure mode and establish a new independent test round.
- CI checks schema, family isolation, and fixture integrity. Pull-request checks use no cloud keys. Manual cloud workflows use separate low-budget credentials.

The manual workflow requires a GitHub `cloud-evaluation` environment. Configure key, base-URL, and endpoint secrets plus model, price, and date variables; names are defined in the workflow file. Environment reviewers are recommended. A successful workflow means the script completed, not that cloud quality passed. Missing configuration is still labeled `unmeasured` in the report, even if the workflow is green.

## Cost comparisons and statistical boundaries

Retrieval evaluation reports initialization embedding cost separately from query embedding/reranking cost. Valid comparisons use the same corpus, model snapshots, price date, and queries, and distinguish cold starts from warm caches. Unknown usage is separate. Budget reservations are not actual charges.

The independent [memory experiment](../reports/memory-baseline.md) compares full history with the actual context builder in estimated input volume, string-level fact retention, and recovery. Real-model task success and paid costs remain unmeasured. A future cloud comparison must include all summarization, extraction, and answer-generation tokens and costs. Estimated token reductions or generation latency must not be directly converted into enterprise labor savings.
