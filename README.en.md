# DeskPilot

[中文说明](README.md) · [Provider setup](docs/provider-setup.md) · [Evaluation](docs/evaluation.md)

DeskPilot is a local, inspectable IT service desk agent built with FastAPI, LangGraph, SQLite, Qdrant local, and React/TypeScript. It connects evidence-based answers, tickets, durable approvals, skill versions, confirmed personal memory, reviewed shared knowledge, and usage accounting.

This is a portfolio project, not a certified enterprise deployment. All 40 knowledge documents and 80 evaluation questions are fictional. The profile picker is demo authentication; software access grants use a simulated adapter. There is no real account-unlock or email-sending connector.

## MCP diagnostics and execution harness

The sixth workspace connects to an actual bundled MCP stdio server for fictional service status and self-scoped device lookup. Optional MCP preflight runs before RAG, with observations displayed separately from reviewed knowledge. A Streamable HTTP adapter supports an explicitly configured enterprise endpoint implementing the two reviewed contracts.

The host pins input/output schemas, binds identity, limits calls and decoded result size, enforces deadlines, persists execution hooks and a circuit breaker, and never sends MCP outputs to Qwen. Remote MCP uses a dedicated credential, an HTTPS host allowlist and DNS checks; it does not support arbitrary tools or OAuth onboarding. Do not treat these controls as OS isolation or complete SSRF prevention. See [architecture, flows and boundaries](README.md) and the [MCP/harness guide](docs/mcp-harness.md).

Before publishing, run `python scripts/check_secrets.py` for the Git index and `python scripts/check_secrets.py --history` for commits. Known synthetic security-test fixtures have exact path/hash exceptions; other test files are still scanned. Credentials remain local and untracked.

## Run without API keys

Requirements: Python 3.11+, Node.js 20.19+ or 22.12+, and npm. No Docker or GPU is required.

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

```bash
bash scripts/setup.sh
bash scripts/start.sh
```

Open [localhost:5173](http://localhost:5173). Demo mode uses real local Chinese BM25 retrieval and source extracts. It never fabricates embeddings, reranker scores, generated model answers, or paid API usage.

## Cloud mode

The first provider adapter supports Alibaba Cloud Model Studio: a Qwen chat model, `text-embedding-v4`, and `qwen3-rerank`. Credentials and endpoints are intentionally blank in `.env.example`. Chat/embedding base URLs and the full reranking endpoint are configured separately. Choose your region and workspace, copy the current endpoints from the provider console, and enter current regional prices. See the [detailed setup guide](docs/provider-setup.md).

```bash
python -m deskpilot.cli check  # With complete config, sends three small paid connectivity calls
python -m deskpilot.cli index-cloud  # Explicit paid embedding/indexing step
python -m pytest -q
python scripts/evaluate.py --split dev
# Explicitly opts into paid provider calls:
python scripts/evaluate.py --cloud --split test --output docs/reports/cloud-test
```

Evaluation runs the actual KnowledgeService. Unavailable cloud strategies are `unmeasured`, never silently replaced with BM25. Query families do not cross the dev/test boundary, and gold labels never enter retrieval code. [Local report](docs/reports/retrieval-baseline.md).

Initial `init` seeds local data without cloud indexing. Setup prefers `uv sync --frozen --extra dev`; its pip fallback uses `requirements.lock.txt` and installs this package with `--no-deps -e .`.

## Limits

Use one backend worker for the local vector store. Demo profiles are not SSO, regex secret checks are not comprehensive DLP, and SQLite audit records are not tamper-proof. Cloud generation is billed separately; missing usage is unknown rather than zero. Consult [operations](docs/operations.md), [security](SECURITY.md), and the [MIT license](LICENSE) before adapting the project.
