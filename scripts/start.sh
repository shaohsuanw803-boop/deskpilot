#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONUTF8=1
if [ ! -x .venv/bin/python ]; then echo 'Run bash scripts/setup.sh first.' >&2; exit 1; fi
mkdir -p .cache/logs
stamp="$(date +%Y%m%d-%H%M%S)-$$"
.venv/bin/python -m deskpilot.cli serve > ".cache/logs/backend-$stamp.log" 2>&1 &
backend_pid=$!
cleanup() { kill "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 2
if ! kill -0 "$backend_pid" 2>/dev/null; then echo "Backend failed; read .cache/logs/backend-$stamp.log" >&2; exit 1; fi
echo 'UI: http://localhost:5173  API: http://localhost:8000/docs  Ctrl+C stops this session.'
(cd frontend && npm run dev -- --host 127.0.0.1)
