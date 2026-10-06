#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONUTF8=1
if command -v uv >/dev/null 2>&1; then
  uv sync --frozen --extra dev
else
  if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
  .venv/bin/python -m pip install -r requirements.lock.txt
  .venv/bin/python -m pip install --no-deps -e .
fi
if [ ! -f .env ]; then cp .env.example .env; fi
if [ -f frontend/package-lock.json ]; then
  (cd frontend && npm ci)
else
  (cd frontend && npm install)
fi
.venv/bin/python -m deskpilot.cli init
echo 'Ready. Run bash scripts/start.sh. Existing data and .env were preserved.'
