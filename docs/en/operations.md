# Maintenance, release, rollback, and backup

[Project README](../../README.md) · [中文版](../operations.md)

The repository maintainer owns code, dependency, skill, and knowledge changes. “IT service desk” owners in fixtures are fictional and do not represent a staffed on-call team. Real deployment requires named owners and an incident-response process.

## Routine maintenance

| Change | Required verification | Responsibility |
|---|---|---|
| Skill version | Tool permissions, approval requirements, and passing regressions before activation | Skill owner and reviewer |
| Knowledge publication | Provenance, applicable versions, access scope, cloud permission, retrieval, and citations | Document owner and IT reviewer |
| Model/provider upgrade | Record model snapshot; run development regressions, fault injection, and usage-field contract checks | Project maintainer |
| Embedding model/dimensions | Rebuild the index; never mix old vectors | Project maintainer |
| Dependency upgrade | Small batches, Python tests, frontend build, and startup checks | Project maintainer |

Release records should identify the commit, Python/Node versions, model names, price date, evaluation-report path, and known failures. “A smarter model” is not a useful release record. When an upstream interface is deprecated, add adapter contract tests before changing request formats; never switch silently.

For localization changes, verify that a fresh browser starts in English, Chinese requires an explicit selection, drafts and selected tasks survive a language switch, and existing evidence remains verbatim. Interface localization must not alter authorization or issue mutation requests.

## Startup and health checks

- Bind the local service to loopback and use one backend worker. Do not share a Qdrant local directory across workers.
- `python -m deskpilot.cli init` only initializes local demo data. `check` makes a small number of paid connectivity requests when configuration is complete. `serve` starts the API. `index-cloud` explicitly builds a paid cloud vector index. `export-audit` exports redacted audit records.
- `/api/health` is a liveness check; `/api/config/status` reports capabilities and missing settings.
- Authentication failures, rate limits, timeouts, dimension errors, insufficient budgets, and indexing failures must be visible in task/operations views, not only backend logs.
- During troubleshooting, retain redacted error categories, run IDs, request stages, and timestamps. Do not copy credentials or complete internal documents into logs.

## Backup

Demo data lives in the `.env` setting `DATA_DIR`, defaulting to `data/`. Stop frontend and backend processes before backup so SQLite WAL files, checkpoints, and indexes represent the same point in time. Back up the complete data directory and the deployed code-version record. Do not copy only an actively written SQLite file.

```powershell
# After stopping services, run from the repository root. Use a new backup directory.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path (Get-Location) "backups\$stamp"
if (Test-Path -LiteralPath $target) { throw 'Backup target already exists' }
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -LiteralPath '.\data' -Destination $target -Recurse
```

For a custom `DATA_DIR`, replace the source with its verified absolute path. `.env` contains credentials and must be stored separately through a secure method; exclude it from public backups and GitHub artifacts. Backups may retain older copies of deleted content. Manage their retention periods and destruction separately.

Restore into a new data directory and point a new `DATA_DIR` at it, preserving the original data. Verify startup, ticket state, memory deletion, document permissions, citations, and checkpoints before switching over. Indexes are rebuildable; rebuilding an index does not restore authoritative data.

## Rollback

1. Stop the new version and preserve failed run IDs and redacted logs.
2. For skill issues, activate the most recent evaluated version. For knowledge issues, withdraw the incorrect version and restore an applicable version after review.
3. Roll back the application to a specific verified commit with a compatible copy of the data backup. Do not assume older code can read every newer data structure.
4. For embedding rollback, restore or rebuild a matching index. Include prices and model versions in the rollback record.
5. Run key ticket, ACL, source, memory-deletion, and budget checks before resuming the demonstration.

## Memory and deletion boundaries

Task state, confirmed personal preferences, and shared team knowledge are different data classes. After a preference is deleted, subsequent runs and recovery paths must not restore it from an old summary or cache. Team knowledge requires review before publication. Checkpoints and audits are historical records. Local deletion does not recall backups or requests already sent to providers. Do not claim legally complete end-to-end erasure.

## What production still needs

Real identities and SSO, service-to-service authentication, a real role directory, secret management, isolated execution, comprehensive DLP, tamper-resistant audit records, retention policies, disaster-recovery exercises, concurrency/load testing, least-privilege real connectors, tenant isolation, and legal/compliance assessment. Demo sessions, regex checks, and SQLite records do not replace these controls.
