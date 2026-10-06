# Bilingual delivery contract

This change implements the user's explicit request: English is the default experience; Chinese is available only after a deliberate language switch. No browser-language detection selects Chinese.

## Scope

- A visible English / 中文 control across all six workspaces, including startup, dialogs, forms, accessibility labels, dates and system feedback.
- The explicit choice persists locally; missing, invalid or unavailable storage falls back to English. Language switching must not discard drafts, change identity, modify permissions or submit actions.
- New tasks capture their response language. A task resumed after approval retains its recorded language.
- User input, knowledge excerpts, source anchors, memory text, tool facts and historical audit records retain their original text. Changing language is not permission to send content to a translation service.
- English product/intent aliases support the fictional Chinese corpus without reading evaluation labels or changing error codes and version numbers.
- README.md is the full English landing page; README.zh-CN.md contains the Chinese architecture and technology tables and diagrams. English technical guides and Chinese originals are cross-linked.
- Credentials remain server-side; no new paid calls, external translation dependency or automatic cloud indexing.

## Verification

Verify English first load even under a Chinese browser locale, explicit toggle both ways, persisted choice, blocked/invalid storage fallback, all six workspaces, form preservation, English queries, Chinese queries, task language persistence, original citation integrity, API rejection of invalid task locales, existing authorization regressions, build, formatting and secret scanning. Publish only reviewed project files.

## Ownership

The shell/i18n, task/admin views and backend response-language changes are implemented independently. Documentation, integration review, browser checks and publication are integrated in the main task.
