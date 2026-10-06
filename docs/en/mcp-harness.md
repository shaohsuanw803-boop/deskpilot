# MCP and the Agent harness: setup, boundaries, and maintenance

[Project README](../../README.md) · [中文版](../mcp-harness.md)

This release uses the official MCP Python SDK 1.x, pinned to the exact version in the dependency lockfile. DeskPilot is the MCP client; the bundled `deskpilot.mcp_demo_server` is a separate stdio server. MCP supplies the protocol. The DeskPilot backend continues to decide authorization.

## Working features

1. In **Connectors & execution**, query VPN status or your device. The protocol exchange is real; bundled business data is explicitly fictional.
2. Under the conversation composer, select the local IT demo for **MCP preflight** and submit a VPN question. The task binds to `diagnose-connected@1.0.0`, queries service status and the current user's device, and then runs the existing RAG workflow.
3. The interface displays MCP observations separately from knowledge citations. Failed preflight checks do not prevent RAG from continuing and are never shown as healthy observations.
4. Expand execution records to inspect `before_tool`, `after_tool`, or `on_error`, latency, and contract digests. Three consecutive failures open the circuit for 60 seconds. Only an administrator can reset it explicitly.

The application starts in English unless the user explicitly selects Chinese. Language selection does not grant permissions, execute tools, or automatically translate external observations and original source text.

## Tools and trust boundaries

| Tool | Input | Output | Host-side rules |
|---|---|---|---|
| `service_status` | `service`: vpn / office / identity | Service, status, summary, observation time, simulation flag | Enumerated service; summary limited to 500 characters |
| `asset_lookup` | Backend-bound `user_id` | User, device, OS, managed status, simulation flag | Every role is restricted to its own identity; the output user must also match |

See [mcp_contracts.py](../../backend/deskpilot/mcp_contracts.py) for the complete input/output JSON Schemas. After initialization, the client lists tools and verifies names plus input/output schema digests before sending `tools/call`. Descriptions and annotations neither grant permissions nor enter model prompts. Extra tools advertised by a remote server are not automatically registered. A server must match the project's contracts individually; configuring an arbitrary third-party MCP URL does not make it compatible.

The local server starts a fixed Python module without an arbitrary command-argument interface. The SDK inherits only its system-environment allowlist; the project adds Python encoding and module-path settings. It neither copies Qwen keys nor reads `.env` in the child. **This is not an operating-system sandbox:** the subprocess still has the current OS user's file permissions. Only run the reviewed server bundled in the repository.

There are no arbitrary file-reading, shell, database-write, email, sampling, or interactive-authorization callback capabilities. MCP results are external data: validate size and structure, redact them, and keep them local. They do not become RAG evidence, historical assistant answers, or Qwen messages. The interface renders plain text rather than executing instructions or HTML from results.

## Remote connector

The remote connector supports **Streamable HTTP**, uses the two tool contracts above, and authenticates with a backend Bearer credential. The `MCP_*` fields in [`.env.example`](../../.env.example) define configuration and defaults. Once enabled, it is available as the enterprise IT connector in the workspace.

`APP_MODE=demo` controls Qwen requests; `MCP_REMOTE_ENABLED` independently controls remote MCP. Business-call arguments contain only the service enum or current user ID, excluding the complete question, knowledge chunks, and chat history.

The adapter supports Streamable HTTP over HTTPS on port 443 with a fixed allowlisted host. It rejects URL user information, query parameters, redirects, and non-public DNS results. It rechecks the address and run state before each HTTP request and disables inherited environment proxies. One overall timeout covers SDK initialization, tool discovery, and execution. HTTP failures do not persist raw exceptions or authentication headers. Filters on MCP SDK transport/session loggers omit raw payloads and exception bodies. The application does not automatically resend `tools/call`; SDK event-stream reconnection is not a business-operation retry.

This release does not implement OAuth login or refresh, user-token passthrough, or a multi-tenant enterprise directory mapping. The remote service enforces its own credential and user-data scope. Demo IDs such as `alice` do not correspond to production enterprise identities. The default network policy excludes private-network MCP services; those deployments require an additional egress-gateway design.

## Harness responsibilities

| Control point | Code | Behavior |
|---|---|---|
| Skills and routing | `workflow.py`, `skills.py` | Pin skill version, require explicit MCP selection, enforce allowed tools |
| Before-tool hook | `harness.py` | Check connector, identity, parameters, task steps, daily quota, and circuit state |
| Protocol execution | `mcp_transport.py` | Official SDK, handshake, pinned schema, and authorization immediately before sending |
| After-tool hook | `harness.py` | Check deadline, result size, output schema, user/service binding, and redaction |
| Error hook | `harness.py` | Safe error codes, failure count, circuit breaker; no automatic MCP retry |
| Persistence | `db.py` | Tool records, events, contract digest, policy version, and local audit |
| Recovery | `workflow.py`, harness initialization | Existing approvals use durable checkpoints and idempotency records; unfinished MCP records become `interrupted` |

Each actual MCP business call consumes one task step; the whole task defaults to a maximum of eight. The daily quota is a call-count limit, not a remote financial bill. Standalone queries also count against it. Calls execute serially to avoid concurrent recovery probes. After the cooldown, the next read-only call is the probe: success clears the circuit; failure opens it again.

Restarting the application does not replay standalone MCP queries. An unfinished LangGraph diagnostic node may query read-only observations again, so read-only queries do **not** have an exactly-once guarantee. Existing access writes still use the local simulated adapter; MCP does not bypass approval.

## Explicit engineering limits

- One machine and one backend worker. Every local call starts a subprocess. Explainability takes precedence over throughput; production systems can introduce pooling and a task queue.
- The per-result size limit applies **after SDK decoding**. It is not a network-layer memory cap. Oversized protocol frames and unbounded notification streams require gateway or process resource limits.
- DNS rebinding can occur between validation and connection. Egress proxies or firewalls must enforce destinations at the network layer. Already-sent requests cannot be recalled.
- Schema review detects interface drift but cannot prove the implementation is read-only. Server code review, least-privilege service credentials, and supply-chain management remain necessary.
- A local administrator can modify SQLite and source code. Audit records are not tamper-proof. Production SSO, tenant isolation, and compliance certification are absent.
- Tool-record retention cleanup is not implemented. Local data and backups require separate access, cleanup, and encryption policies.
- Real enterprise endpoints and Qwen quality need validation after configuration. HTTP MockTransport tests verify protocol contracts, not live provider integration.

## Verification and maintenance

```powershell
.venv\Scripts\python.exe -m pytest tests/test_mcp_harness.py tests/test_mcp_transport.py -q
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe scripts/check_secrets.py
.venv\Scripts\python.exe scripts/check_secrets.py --history
```

`check_secrets.py` reads the Git index or committed history and reports filenames and line numbers, never matched secret values. Verified historical synthetic-key fixtures have exact-path and SHA-256 exceptions; the entire test directory is not exempt. This heuristic check does not replace comprehensive secret scanning.

Remote contract upgrades follow this sequence: disable the connector → review implementation and schemas → update local contracts and regression tests → pass tests → restart → administrator resets the circuit → explicitly validate read-only operations. The runtime never automatically accepts a newly advertised schema.

References: [Official Python SDK 1.x](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x), [MCP security practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).
