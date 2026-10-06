# Bilingual release verification / 双语版本验证

Date: 2026-10-06. Environment: Windows, local Python virtual environment, demo mode. No paid Qwen or real enterprise MCP requests were made.

## Measured checks

| Check | Actual result |
|---|---|
| Complete backend suite | **104 passed in 68.73s** |
| Frontend locale/API tests | **6 passed**, including default English under a Chinese browser, explicit persistence, invalid and blocked storage, subscriptions and JSON/multipart language headers |
| Backend language coverage | 8 new tests: default/explicit/invalid locale, approval restart/idempotency, original citations and revoked sources, credential-safe errors, aliases, display metadata and unchanged personal content |
| Static checks | Ruff and `git diff --check` passed |
| Frontend | TypeScript, Vite production build and Prettier passed; 1,840 modules built |
| Code review | Separate read-only review found no actionable permission, approval or evidence regressions |
| Existing dev retrieval regression | 40 questions / 36 answerable; BM25 Hit@5 and Recall@10 **0.9444**, MRR@5 **0.9306**, behavior accuracy **0.925**, ACL violations **0**; quality metrics match the prior baseline |

The frontend language tests use isolated VM browser fixtures, not a real browser. The following browser observations provide separate integration evidence.

The retrieval comparison reran `python scripts/evaluate.py --split dev --output .cache/bilingual-retrieval` against the existing Chinese dev set. It checks regression of that set, not broad English retrieval quality. Measured p50/p95 were 162.11 / 199.78 ms; timing depends on the local environment and is not a promised speedup. Cloud strategies remain unmeasured.

## Browser observations

- First opened the rebuilt app in English, with an explicit 中文 button, English page title and all six workspace labels.
- Typed an English VPN question, switched to Chinese, then back to English. The full draft and selected identity were unchanged. Switching itself submitted no task.
- Selected Chinese explicitly and reloaded: Chinese remained selected. Switched back to English and left the deliverable in English.
- Submitted `Windows 11 Starbridge VPN 5.2 error 809 connection timeout` with local MCP preflight. Both MCP calls succeeded; RAG showed English section headings and five original-language source citations. Fictional MCP data was visibly separate from knowledge evidence and stayed in its original language.
- Inspected all six workspaces: knowledge controls, skill/version display labels, memory, connectors and operations were English. Source titles, prior user questions and stored instructions were intentionally unchanged.
- Checked the English layout at 390px and 1280px widths. The narrow header keeps the language control available; the desktop retains the blue-and-white layout. Restored the browser viewport afterward.

## Documentation and limits

README.md is the complete English landing page. README.zh-CN.md contains the Chinese architecture table, technology table, architecture diagram, stack diagram and business flow. Seven English technical guides sit alongside the existing Chinese guides. Contribution/security guidance and issue/PR entry points are English-first or bilingual.

Changing language is not a translation service. Original knowledge, uploaded files, user input, memory, external tool facts, historical answers and audit content are not rewritten. New runs retain their recorded response language after approval/resumption. This release does not establish broad cross-language retrieval quality, paid-model answer accuracy, production security certification or complete DLP coverage.

Chinese summary: 默认英文，中文必须手动切换；切换保留输入和身份，已选择语言可跨刷新保留。界面与系统提示双语，引用和用户资料保持原文。全量后端 104 项、前端语言 6 项测试通过；真实云端效果仍未测。
