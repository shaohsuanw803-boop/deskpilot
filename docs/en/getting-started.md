# Getting started

[README](../../README.md) · [中文版](../getting-started.md)

Run the fictional IT helpdesk locally, without model keys or Docker. Dependency installation needs internet access; the default demo uses local keyword retrieval, source excerpts, persistent workflows, and a bundled MCP server.

## Requirements

- Python 3.11 or newer; CI runs Python 3.11 on Windows and Linux.
- Node.js 22.12+ with npm is recommended; frontend CI runs Node.js 22. The existing setup also supports Node.js 20.19+.
- Git. `uv` is optional: setup uses the frozen uv lock when available, otherwise the pinned pip requirements.

## Install and start

Clone the repository and enter it:

```sh
git clone https://github.com/shaohsuanw803-boop/deskpilot.git
cd deskpilot
```

**Windows PowerShell**

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

**macOS / Linux**

```sh
bash scripts/setup.sh
bash scripts/start.sh
```

Setup installs locked dependencies, creates `.env` from the blank example only if absent, and initializes 40 fictional knowledge documents. It preserves existing configuration and data. Start runs the API and frontend together; keep that terminal open.

- Application: [http://localhost:5173](http://localhost:5173)
- API reference: [http://localhost:8000/docs](http://localhost:8000/docs)
- Stop: press **Ctrl+C** in the startup terminal. The script stops the backend process it started.

The interface defaults to **English**. Click **中文** in the header to switch, or **English** to switch back. Only an explicit choice is saved. New tasks retain their chosen response language when resumed. Original documents, citations, messages, and stored facts keep their source language; the supplied knowledge corpus is Chinese.

## Three-minute walkthrough

1. **Check an answer and its evidence.** Select employee **Alice Lin** using **Demo identity**. Ask `Windows 11 Starbridge VPN 5.2 error 809: how can I troubleshoot the connection timeout?` Open a source card under the answer, then the retrieval and execution trace. Demo answers are structured source excerpts, not a paid model response.
2. **Inspect a real MCP exchange.** In **Connectors & execution**, use the local IT demo connector to **Check VPN status** and **View my device**. It speaks the MCP protocol but returns fictional data. Alternatively, select that connector under **MCP preflight** before asking a new VPN question. Its observations appear separately from approved knowledge and are not sent to the cloud model.
3. **Complete an approval.** As Alice, submit `I need standard access to Visio.` The run pauses for review. Switch the demo identity to **Chen** (IT) or **Administrator**, open **Approval queue**, and inspect the requester and exact parameters before choosing **Approve execution**. Open the linked run to see the simulated grant. Employee identities cannot approve; no real software account is changed.

These identities demonstrate server-side roles; they are not production authentication. For the full boundaries, see [implementation status](implementation-status.md).

## Build the UI and serve one local application

For a local presentation without the Vite development server, stop the startup script, then build the UI:

```sh
cd frontend
npm run build
cd ..
```

Start the backend from the repository root:

```powershell
# Windows
.\.venv\Scripts\python.exe -m deskpilot.cli serve
```

```sh
# macOS / Linux
.venv/bin/python -m deskpilot.cli serve
```

Open [http://localhost:8000](http://localhost:8000). FastAPI serves `frontend/dist` when it exists. This is a local presentation build, not a production deployment configuration. Rebuild after changing frontend code.

## Add cloud models later

The default `APP_MODE=demo` does not call Qwen generation, embedding, or reranking. Those adapters are implemented, but paid behavior and retrieval quality still require a cloud evaluation. Follow the [Qwen setup guide](provider-setup.md) to configure the separate interfaces, prices, connectivity check, and explicit cloud indexing step. Incomplete cloud configuration produces an error instead of silently substituting a model.

Remote MCP is a separate opt-in feature and is not enabled merely by configuring Qwen. Supported transports and tool contracts are described in [MCP and harness](mcp-harness.md).

## Troubleshooting

| Symptom                              | Check                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PowerShell refuses to run scripts    | Follow your machine's script-execution policy. On a managed device, ask the administrator; do not disable system-wide protections.                                          |
| The API exits during startup         | Read `.cache/logs/backend-*`. Check dependency installation and whether port 8000 is already used. Stop only a process you recognize.                                       |
| The page loads but API requests fail | Use the UI URL printed by Vite. Its development proxy targets port 8000; changing only the backend port does not change that proxy.                                         |
| An index reports a storage lock      | Stop a previous DeskPilot instance using the same data directory. Local Qdrant uses one backend worker and one client; do not run multiple backends against that directory. |
| An older UI appears on port 8000     | Run `npm run build` again. Development changes are served on the Vite URL, while port 8000 serves the last build.                                                           |
| A cloud or connector request fails   | Read the safe error in the run trace and consult the respective integration guide. Do not delete `data/` to repair a credential, rate-limit, or timeout problem.            |

For backup and upgrades, see [operations](operations.md). For tests and changes, see [contributing](../../CONTRIBUTING.md).
