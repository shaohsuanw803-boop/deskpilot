# Security policy

[简体中文](docs/SECURITY.zh-CN.md) · [Project README](README.md)

DeskPilot is a local demonstration. It does not provide production enterprise authentication, SSO, complete DLP, an isolated tool sandbox, immutable audit or compliance certification. The demo identity picker intentionally allows role changes and must not be exposed to untrusted networks.

Bind to loopback and use fictional data. Never publish `.env`, application data, backups or logs. Cloud mode sends approved content to configured providers; callers must have permission to do so. `cloud_allowed` is not a legal-compliance determination. MCP remote mode has its own explicit enable switch and separate credential.

## Reporting a vulnerability

If GitHub Private vulnerability reporting is enabled, use **Security → Report a vulnerability**. Otherwise, use a private contact channel explicitly provided by the maintainer. Do not disclose usable credentials, sensitive documents or complete exploit chains in public issues. No enterprise security response SLA is promised.

Include the affected revision, a minimal fictional reproduction, expected and actual permission boundaries, and whether data was sent externally. Do not probe real company systems without authorization.

## Implemented controls and remaining risks

- Server code enforces retrieval and source-access permissions; demo identities are not trustworthy production identities.
- Credential-pattern checks block some sensitive outbound data but cannot identify every secret or personal record.
- External content cannot grant tools authority. Model and MCP outputs still require validation.
- Simulated sensitive changes use approval and audit. Real integrations need separately validated least privilege and idempotency.
- Users with local filesystem access can modify SQLite records; audit is not tamper-proof.
- Deleting a memory cannot recall data already sent to providers or automatically erase backups.
- MCP contract checks do not prove implementation safety; decoded size checks and DNS validation require additional resource and network controls in production.
- Language selection changes presentation, not permissions. Sources, personal memories and historical facts are never automatically translated or sent to another provider.

Scan Git index and history using `scripts/check_secrets.py`; output omits matched values. This is a heuristic, not a complete DLP or secret-detection guarantee. If a credential leaks, revoke or rotate it before cleaning history and copies.

Only the currently maintained repository version is supported. Read changes and evaluation reports before upgrading and preserve protected backups.
