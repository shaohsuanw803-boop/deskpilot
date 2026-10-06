# Contributing

[简体中文](docs/CONTRIBUTING.zh-CN.md) · [Project README](README.md)

Describe a reproducible issue, operating system, Python/Node versions, demo/cloud mode and a redacted run ID. Never include API keys, real company documents, personal information or complete provider responses.

## Development and verification

```bash
uv sync --frozen --extra dev
# Without uv: python -m pip install -r requirements.lock.txt
# Then: python -m pip install --no-deps -e .
python -m pytest -q
python -m ruff check backend tests scripts
python scripts/evaluate.py --split dev
cd frontend
npm ci
npm run test:i18n
npm run build
npm run format:check
```

Keep changes focused. Changes to permissions, document lifecycle, approvals, memory deletion, outbound processing or budgets need tests that reproduce an actual failure, not assertions that mirror implementation constants. Provider request/response changes require mock HTTP contract tests. Pull-request CI never uses paid credentials.

Tune retrieval on the development set and record the reason and measured difference. Do not inspect held-out labels and add a branch specific to that question. Backend runtime code must not read `fixtures/eval`. If the corpus changes, run the corpus-integrity tests and preserve fictional-data notices and family separation.

New skills require owners, tool permissions, evaluations and activation records. Shared knowledge requires review. Describe capabilities and limits honestly: simulated adapters are not production connectors.

## Language changes

English is the initial UI language. Chinese requires an explicit user choice; never infer it from the browser. Add both English and Chinese UI text, including validation, empty states and accessibility labels. Keep source evidence, user-authored data and historical facts unchanged. Locale is a presentation preference, not authorization. New task language must survive approval and resumption; changing the UI must not reset drafts or submit operations.

Use `frontend/src/i18n.ts` for UI text and the backend locale helpers for system messages. Do not add cloud translation as a side effect of switching languages. Keep the English and Chinese README architecture tables consistent, and distinguish translated documentation from dated original evaluation reports.

In a PR, describe the problem, resulting behavior, commands run, actual results and anything untested. Separate model and dependency upgrades where practical so changes can be rolled back. Contributions use the MIT license; retain third-party notices.
