# Memory, task continuation, and context

[Project README](../../README.md) · [中文版](../memory-design.md)

DeskPilot does not permanently stuff every chat into prompts. SQLite tickets and run records are the source of task facts. LangGraph checkpoints restore execution. Personal preferences are saved only after confirmation, while team experience must become a knowledge candidate and pass review before publication.

## Rebuild context on every run

- Keep the original request for the current task, rather than forgetting the initial issue after retaining only recent turns.
- Keep at most eight progress reports supplied by the user, such as “I restarted the client, but error 809 persists.” These are user reports, not automatically verified conclusions.
- Add the latest four authorized and valid conversation turns instead of copying unbounded history.
- Include at most three valid, confirmed personal preferences. Ticket context also includes the current title, description, status, and resolution record.
- Include the current skill version and reviewed requirements. Skills cannot override tool authorization or source restrictions.

To continue across sessions, select the original ticket or conversation identifier. A new topic under the same browser identity does not inherit arbitrary tickets owned by someone else. Server-side identity and ownership checks still govern cross-user access.

The interface starts in English. An explicit language selection applies to presentation and subsequent runs without deleting drafts or rewriting existing conversations. Stored preferences, user reports, source excerpts, and previous answers retain their original language; switching the interface is not an automatic translation operation.

## Prevent deleted information from returning

Every context build revalidates source and personal-memory revisions. Old checkpoint text cannot directly substitute for current conversation history. When a preference is edited or deleted, historical answers depending on its previous revision become invalid. They no longer appear as valid historical answers or feed subsequent context.

Withdrawal, version changes, permission changes, and cloud-permission changes also require source revalidation. Old summaries, caches, and persistent state cannot bypass current rules. Personal preferences cannot silently become team knowledge without review.

Local invalidation does not erase every trace. Backups, audit records, and requests already received by third parties have separate lifecycles. The project does not claim to recall external requests or provide legally complete end-to-end erasure.

## Experiments and limits

The [measured memory experiment](../reports/memory-baseline.md) compares 20 fictional tasks with 11 turns each. It includes 20 recovery checks that close and reconstruct `DeskService` **within one process**, not machine restarts or process-crash tests. Input-token counts are deterministic estimates. String-level fact retention is checked programmatically. Neither is a measure of model understanding, real issue resolution, or actual provider bills.

Read the report's denominators and limits first. Until a real-model full-history comparison is run, do not equate estimated context reduction with API cost savings. Any future paid experiment must include the cost of summarization and extraction calls themselves.
