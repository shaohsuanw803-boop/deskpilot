# Runtime reliability / 运行可靠性

[English README](../README.md) · [中文首页](../README.zh-CN.md)

DeskPilot applies request controls before parsing, records task submissions durably, and separates HTTP retries from workflow recovery. These mechanisms target a single backend process.

## Request boundary

| Control | Default behavior |
|---|---|
| General request body | 64 KiB maximum, measured in bytes |
| Knowledge upload body | 21 MiB including multipart overhead; the document parser retains its 20 MiB file limit |
| Body reception | 15-second absolute deadline across all chunks |
| Active API mutations | Four admitted requests; further requests return `503` and `Retry-After: 1` |
| Correlation | Server-generated `X-Request-ID`, independent of client headers |

The ASGI boundary checks `Content-Length` for early rejection and counts the actual received bytes. A complete bounded body is required before JSON or multipart parsing. Missing or understated length headers do not bypass the limit. Oversized bodies return `413`; incomplete uploads that exceed the deadline return `408`. Completion, disconnect, cancellation, and exceptions release the admission slot. Health and other GET requests do not consume mutation slots.

The CLI configures the `deskpilot.http` logger. Its completion event contains only the generated request ID, HTTP method, resolved route template, status, and elapsed time. It excludes raw paths, query strings, headers, and request bodies. Accepted task submissions also record the request ID in the task's audit trail.

[Boundary implementation](../backend/deskpilot/http_boundary.py) · [Framing and overload tests](../tests/test_http_boundary.py)

## Task submission contract

`POST /api/runs` accepts an optional `Idempotency-Key` header containing 1–128 printable ASCII characters without whitespace. The web client supplies a UUID for each pending submission.

| Request | Result |
|---|---|
| New user/key pair | Atomically store the thread update, task, and submission receipt; execute the workflow |
| Same user, key, and payload | Return the current task, without a second graph invocation |
| Same user/key with different parameters | `409 Conflict` |
| Same key from another user | Independent user-scoped receipt |
| Missing task behind a receipt | Fail closed with `409`; do not create a replacement silently |
| No key | Backward-compatible creation of a new task |

The payload digest includes message, thread, ticket, cloud permission, connector, and resolved response language. Raw keys are not stored. Receipts retain the task ID and digests rather than an answer snapshot. The API rechecks source and memory validity on every replay, so a withdrawn document cannot reappear through a cached response.

The browser keeps the pending key after a lost response or `503`; a manual retry of the unchanged submission reuses it. A successful response completes the intent. A later submission, changed parameters, or a different identity gets a new key. This pending intent is kept in memory within the mounted workspace, not across a page reload.

Failed or interrupted tasks retain their receipt. A repeated HTTP submission reads their state; it does not automatically spend again. Restart recovery remains the workflow's responsibility. Recovery may repeat a read-only query or an interrupted provider call; request idempotency does not promise exactly-once execution in remote systems. Receipts currently remain for the lifetime of the local task data, without automatic expiry.

[Workflow](../backend/deskpilot/workflow.py) · [Replay and concurrency tests](../tests/test_run_idempotency.py) · [API regression tests](../tests/test_request_safety.py)

## Budget configuration

Budgets and configured prices must be finite and nonnegative. `NaN`, infinity, and negative amounts are rejected at startup. Zero is a valid explicit budget; missing prices remain unavailable. Retry counts and timeouts also have validated bounds. These checks complement the existing atomic provider-budget reservation; they do not validate the accuracy of the configured supplier prices.

## Deployment scope

Admission is per process, not a distributed queue or per-user rate limiter. Bodies are buffered within application limits; this is not a transport-level memory limit. The workflow remains serialized for local SQLite/Qdrant access. The health endpoint is liveness, not dependency readiness. Demo identities remain selectable, and production authentication, tenancy, network isolation, retention, load testing, and external-provider quality remain separate deployment work.

## 中文说明

### 请求入口

普通请求体上限 64 KiB，知识上传整体上限 21 MiB，内部文件解析仍限制为 20 MiB。中间件在解析前校验声明长度，并累计真实字节数；完整请求体超限返回 `413`。读取所有分块共用 15 秒绝对时限，超时返回 `408`，持续发送少量数据不会重置计时。

同一进程最多接纳四个 API 写请求，读取请求体前即占用配额；满载返回 `503` 和 `Retry-After: 1`。完成、断连、取消和异常均释放配额，健康检查等 GET 请求不占写配额。

服务端生成请求 ID，写入响应头；任务提交审计使用同一 ID。结构化 HTTP 日志只记录请求 ID、方法、路由模板、状态与耗时，不记录原始路径、查询参数、请求头和正文。

### 提交幂等与恢复

`POST /api/runs` 支持可选的 `Idempotency-Key`。同用户、同标识、同参数返回现有任务；参数不一致返回 `409`；不同用户互不共享凭证。原始标识不落库，任务与摘要凭证在同一事务保存。回放读取最新任务并重新检查引用和记忆权限，不缓存旧答案。

网页在响应丢失或繁忙错误后保留当前提交标识，手动重试相同请求时复用；成功、修改参数或切换身份后生成新标识。该状态只在当前工作区内存中保留，刷新页面不会恢复它。失败任务的凭证仍有效，重放不会重新发起付费工作流。进程重启恢复可能重做尚未保存检查点的只读或模型调用，因此不代表外部系统的“恰好一次”。

预算和价格拒绝 `NaN`、无穷大与负数，缺失价格仍保持未知。上述能力改善单机可靠性；当前仍没有生产身份认证、多租户、分布式队列、依赖就绪检查或真实负载验证。
