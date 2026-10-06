# Runtime reliability verification / 运行可靠性验证

Date: **2026-10-06**. Environment: Windows, Python 3.11, local demo data. No paid model calls or enterprise MCP requests were made.

## Observed results

| Check | Result |
|---|---|
| Full backend suite: `python -m pytest -q` | **195 passed in 67.01s** |
| `python -m ruff check backend tests scripts` | Passed |
| `npm run test:i18n` | **9 passed**, including three pending-submission retry cases |
| `npm run build` | TypeScript and Vite production build passed |
| `npm run format:check` | Passed |

[CI](../../.github/workflows/ci.yml) runs offline backend checks on Windows and Ubuntu and frontend checks on Ubuntu. Local results above are distinct from the current [Actions status](https://github.com/shaohsuanw803-boop/deskpilot/actions/workflows/ci.yml).

## Browser smoke check

The production frontend served by FastAPI was tested in the in-app browser with a fresh local demo store. The default English workspace submitted `Windows 11 Starbridge VPN 5.2 error 809 connection timeout`, displayed a local-excerpt response with five citations and one recent task, and opened the troubleshooting source with its version, section and access-verified state. This was one happy-path smoke check; transport-loss and overload behavior are covered by the automated tests below.

## Behavior covered

| Boundary | Regression evidence |
|---|---|
| Durable task admission | Same user/key/payload invokes the graph once; concurrent duplicates, process recreation, failed or interrupted tasks, changed payloads, separate users, missing targets and transaction rollback are covered. [Tests](../../tests/test_run_idempotency.py) |
| API replay | A matching retry returns the same run and approval; a conflicting payload returns 409; a revoked source remains invalid when replayed. [Tests](../../tests/test_request_safety.py) |
| Request framing | Declared and actual byte counts, missing or false Content-Length, oversized multipart bodies, chunked payloads and multibyte text are rejected before the application parser. [Tests](../../tests/test_http_boundary.py) |
| Slow or excessive work | Stalled and trickle bodies hit one absolute deadline; overload returns 503 with Retry-After; completion, timeout, disconnect, cancellation and errors release slots. GET does not consume a mutation slot. [Tests](../../tests/test_http_boundary.py) |
| Correlation and error handling | Generated request IDs override incoming IDs; safe route-template logs omit raw URLs and content; application TimeoutError is not reported as an upload timeout. [Tests](../../tests/test_http_boundary.py) |
| Configuration | NaN, infinity, negative money values and invalid retry/timeout bounds are rejected; zero budgets and unknown prices remain distinct. [Tests](../../tests/test_request_safety.py) |
| Browser retry intent | Lost responses and 503 preserve the pending key for manual retry; success, changed payload or changed identity creates a new intent. No automatic retry is introduced. [Tests](../../frontend/tests/i18n.test.mjs) |

## Scope and remaining work

The tests use local records and controlled failures. They establish behavior under these cases, not production throughput, distributed exactly-once execution, or comprehensive security certification. Admission remains per process, workflow work remains serialized, and the browser's pending key does not survive a page reload. Demo identity selection is unchanged.

The earlier [bilingual report](bilingual-verification.md) records the 40-question Chinese development-set BM25 evaluation. Those retrieval scores were not remeasured for this local reliability check. Dense/hybrid/reranking cloud quality, generated answer quality, real supplier cost and enterprise MCP integration remain unmeasured.

## 中文说明

本次本地实测通过 195 项后端测试、9 项前端测试，以及代码检查、类型检查和生产构建。新增验证聚焦提交幂等、越权／撤回后的重放、解析前大小限制、慢请求绝对截止时间、超载与异常后的配额释放、请求关联和非法金额配置。

这些测试支持单进程机制的实现结论，不代表生产认证、负载达标或商业化验收。真实身份、企业数据上的千问效果、供应商账单和远程业务联调仍待验证。完整行为契约见[运行可靠性](../runtime-reliability.md)。
