# Delivery status

[Project README](../../README.md) · [中文版](../implementation-status.md)

Scope: a complete local IT service desk portfolio application, Qwen cloud adapters, and RAG with source and authorization checks. **Implemented** means code has been delivered; it does not mean production acceptance or validated real-model cloud quality.

- [x] SQLite persistence, demo identities, authorization policies, and module contracts.
- [x] Document parsing, version publication/withdrawal, administrator preview, import retries, hybrid retrieval, and citation validation.
- [x] Qwen chat, `text-embedding-v4`, and `qwen3-rerank` adapters with explicit degradation.
- [x] LangGraph workflows, durable approvals, simulated software-access tools, versioned skills, memory, and budget records.
- [x] Six web workspaces backed by actual APIs, including MCP connectors and execution controls.
- [x] English-default workspaces with an explicit Chinese switch, persisted selection, durable task language and unchanged source evidence; full English README and seven English technical guides.
- [x] Real stdio integration through the official MCP SDK; configurable Streamable HTTP; service status and self-device queries; pinned schema digests; quotas; circuit breakers; execution hooks.
- [x] Git-index and history secret scanning, with exact-path and hash exceptions for verified synthetic test keys.
- [x] Forty fictional Chinese knowledge documents and eighty questions separated into development/test sets by family.
- [x] Automated tests for authorization, knowledge lifecycle, provider failures, workflow recovery, and related behavior.
- [x] Actual local retrieval and memory experiment reports; see [evaluation methodology](evaluation.md).
- [x] Windows/POSIX startup scripts, locked dependencies, setup/maintenance guides, offline CI, and manual cloud evaluation.
- [x] September 30, 2026 backend regression: **81 passed in 50.71s**; Ruff, frontend production build, and Prettier passed. The uv lockfile's offline consistency check passed on September 29, 2026.
- [x] October 6, 2026 MCP regression: **96 passed in 58.30s**; Ruff, lockfile consistency, TypeScript, Vite, and Prettier passed. See the [MCP verification record](../reports/mcp-harness-verification.md).
- [x] October 6, 2026 bilingual regression: **104 passed in 68.73s**, six frontend language tests, Ruff, TypeScript, Vite and Prettier passed. See the [bilingual verification record](../reports/bilingual-verification.md).
- [x] Blue-and-white browser checks and JPG screenshots are saved. The first-version recording retains the earlier color scheme. The 390px layout was checked; mobile-menu interaction still needs physical-device review. Dates and exact coverage are recorded in [browser verification](../browser-verification.md).

The bilingual update makes the interface English by default, with an explicit Chinese switch. Stored source evidence and previous answers retain their original language. The historical test counts above refer to their dated releases; consult the current README, verification report, and CI for the bilingual change's actual results.

Real paid Qwen calls, dense/hybrid/reranking cloud quality, and actual cloud costs remain **unmeasured**. They require configured credentials and explicit execution; simulated HTTP tests and BM25 reports cannot substitute for them. The remote MCP protocol adapter has HTTP fixture coverage, while real enterprise-service integration still needs validation. Production SSO, real access writes, tamper-proof auditing, and enterprise compliance certification are **not implemented**.
