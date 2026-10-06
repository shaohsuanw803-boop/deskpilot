# Implementation contract

This document summarizes core module interfaces. The [API source](../backend/deskpilot/api.py) and generated `/docs` OpenAPI specification define the complete current HTTP contract. All application IDs are strings.
SQLite is the source of truth, Qdrant local is a disposable/rebuildable vector index.

## Shared Python interfaces

- `Settings` in `deskpilot.config`: pydantic settings, lowercase env field names; `app_mode` demo/cloud,
  `data_dir: Path`, `repo_root: Path`, three provider config groups from .env.example; `cloud_missing()` -> list[str].
- `Store(path: Path)` in `deskpilot.db`: thread-safe `get(kind,id)->dict|None`,
  `list(kind)->list[dict]`, `put(kind,item)->dict`, `delete(kind,id)`,
  `transaction()` context manager (same RLock and SQLite connection; nested methods use transaction),
  `audit(actor, action, target, details=None)`, `close()`.
  Objects carry `id`, others arbitrary JSON. Store auto sets `updated_at`. `now()` UTC ISO.
- `User` in `deskpilot.policy`: frozen dataclass `id,name,role,department`, `.as_dict()`.
  `USERS` dict: `alice` employee/product, `bob` employee/finance, `chen` it/IT, `admin` admin/IT.
  `can_read(user, document)` checks published/current state, `roles` and optional `allowed_users`.
  `require_role(user,*roles)`, `check_outbound(texts)` rejects secret patterns.
  `PolicyError` inherits ValueError. External content is always untrusted data.

## RAG subsystem

`KnowledgeService(store, settings)`:
- `ingest(filename: str, content: bytes, metadata: dict, user: User, document_id: str|None=None)->dict`:
  parse into staging version, persistent job, don't replace current published until publish.
- `publish(document_id, user)->dict`; `withdraw(document_id,user)->dict`; `retry(job_id,user)->dict`.
- `list_documents(user)->list[dict]` (admin/it see pending, employee published accessible only).
- `get_source(chunk_id,user)->dict`: authoritative source + document metadata; withdrawn denied.
- `search(query,user,run_id=None,context=None,strategy='default')->dict` returning
  `{query,rewritten_query,mode,status,evidence:[{id,document_id,title,version,anchor,text,cloud_allowed}],
    trace:{...},elapsed_ms,...}`. status `ready|needs_clarification|no_evidence|degraded`.
- `answer(query,user,run_id,context=None)->dict`: `{answer,status,citations:[evidence],retrieval:{...}}`.
  Demo answers are source extracts (not simulated semantic retrieval), cloud generated answers validated.
- `close()` closes vector index. `.providers` may be exposed for integration tests.
- Metadata common fields: `title,product,product_version,owner,roles:list[str],cloud_allowed:bool,
  allowed_users:list[str],source_ticket_id`. Document lists include `id,title,status,version,active_version,
  product,product_version,cloud_allowed,roles,chunk_count,updated_at`.
- `ProviderGateway` handles generation, embeddings, and reranking; protocol tests use mocked HTTP responses.
- Jobs stored as `ingestion_job`, documents `document`, chunks `chunk`; other needed kinds unrestricted.
- `seed` CLI imports `fixtures/knowledge/*.md` and matching JSON catalog entries.
- Permission checks before retrieval, cloud transmission, response AND source fetch. Secret checks cover all
  outbound material. Restricted candidates stay local and are NOT sent to cloud reranker/generator.
- Demo retrieval makes no model-provider requests and does not synthesize vectors. Changing embedding model/dimensions requires an index rebuild.

## Core API contract

All `/api/*`; credentials same-origin cookie (demo profile selector creates server session).
Response errors `{detail: string}`. List responses `{items:[...]}`. Startup seeds fixtures once.

- `GET /bootstrap` -> `{mode,user,users,summary:{documents,runs,tickets,approvals},config:{cloud_ready,missing,capabilities}}`
- `POST /session {user_id}` -> `{user}` (sets HttpOnly cookie).
- `POST /runs {message,thread_id?,ticket_id?,cloud_allowed?:bool,mcp_server?,locale?}` -> run object.
  The optional `Idempotency-Key` header binds one user's original payload to a durable task; mismatched reuse returns `409`. See [request boundaries and replay semantics](runtime-reliability.md).
  Run `{id,thread_id,user_id,status,answer,citations,retrieval,events,created_at,skill_id,skill_version,approval_id?}`.
  Status `completed|awaiting_approval|needs_clarification|no_evidence|degraded|failed|rejected`.
- `GET /runs` -> own items (it/admin all); `GET /runs/{id}`; `GET /runs/{id}/events` SSE persisted events.
- `GET /tickets`; `POST /tickets {title,description,run_id?,cloud_allowed?:bool}`;
  `POST /tickets/{id}/resolve {resolution}`; `POST /tickets/{id}/knowledge` -> candidate document.
  Ticket `{id,title,description,status,owner_id,created_at,resolution?,run_id?}`.
- `GET /approvals`; `POST /approvals/{id}/decision {decision:'approve'|'reject'}`.
  Approval `{id,run_id,requester_id,tool,parameters,status,expires_at,skill_version,policy_version}`.
- `GET /knowledge`; `POST /knowledge` multipart: `file`, `metadata` JSON string.
  `POST /knowledge/{id}/versions` same multipart, `POST /knowledge/{id}/publish`,
  `POST /knowledge/{id}/withdraw`, `GET /knowledge/jobs`, `POST /knowledge/jobs/{id}/retry`.
- `GET /sources/{chunk_id}`; `POST /retrieval/inspect {query,strategy?}`.
- `GET /skills`; `POST /skills/{id}/evaluate {version}`;
  `POST /skills/{id}/activate {version}` (only evaluated version).
  Skills `{id,name,description,owner,active_version,versions:[{version,status,allowed_tools,...}]}`.
- `GET /memories`; `POST /memories {text,confirmed:true}`;
  `PATCH /memories/{id} {text,confirmed:true}`; `DELETE /memories/{id}`.
- `GET /operations` -> `{runs,usage,audit,evaluations,totals:{...}}` (it/admin; redacted).
- `GET /health`, `GET /config/status`; `POST /config/check` (admin, cloud connectivity check).

## Frontend

React TS + Vite, six workspaces: tasks, knowledge, skills, memory, connectors, operations.
Workspaces read backend APIs and display demo/cloud/degraded mode alongside actual records.
Vite proxies `/api` to localhost:8000. Default frontend localhost:5173.
Source IDs are URL-encoded using encodeURIComponent. Untrusted text is rendered without executing HTML.

## Corpus

`fixtures/knowledge/catalog.json` array: `{id,file,title,product,product_version,owner,roles,
cloud_allowed,allowed_users?}`. 40 Markdown files. All fictional and clearly labeled.
`fixtures/eval/questions.json` array: `{id,family,split:'dev'|'test',query,user_id,
expected_document_ids:list[str],expected_behavior:'answer'|'clarify'|'abstain'|'deny',category}`.
80 cases; family never crosses split. IDs match the catalog; evaluation uses the general retrieval path without query-specific answer routing.
