# EOPP Architecture Wiki

This wiki captures the final audit of the protected-core architecture work from
`docs/superpowers/plans/2026-06-11-protected-core-architecture.md`.

## Pages

- [Architecture](architecture.md) - layers, phase coverage, module boundaries, risks.
- [Entities](entities.md) - business entities, lifecycle, source-of-truth fields, invariants.
- [Flows](flows.md) - captcha, usage, billing, realtime, jobs, and peak-mode sequences.
- [Deployment](deployment.md) - release manifests, backups, full state promotion, rollback.
- [Legacy Cleanup](legacy-cleanup.md) - delete/migrate/deprecate candidates with usage and risk.

## Audit Baseline

- Branch: `master`.
- Working tree: dirty; current architecture/deploy work is not committed.
- Latest commits:
  - `782d9d1 chore: capture current architecture and deployment work`
  - `e90a36f docs: audit report + action plan; extension: constants and store updates`
  - `18cf7c7 feat: operators UX overhaul + company entity + chat + scheduled events`
- CodeGraph status: 497 indexed files, 7279 symbols, 7632 edges.
- Import boundary check: `uv run lint-imports` kept the protected-core contract.
- Focused test run: 41 passed, 2 failed. Failures are in `tests/test_core_smoke.py` via
  `server/tests/test_core_smoke.py`; pending session appears around 5.6s while the smoke wait
  is 2s, which is a hot-path latency/test-fragility risk.

## Phase Coverage Snapshot

| Phase | Status | Evidence | Gaps |
|---|---|---|---|
| 0 Baseline/import safety | Mostly implemented | `.importlinter`, root test wrappers | smoke test latency failures |
| 1 Peak fast mode | Implemented with caveats | flags in `src.constants`, deferred archive/metadata/billing | `/fail-usage` still sync-parses captcha records |
| 2 Protected core runtime | Implemented | `src.core.captcha_runtime`, thin `/solve-captcha` and `/solve` handlers | adapter still owns distribution bridge |
| 3 Jobs/outbox | Implemented | `background_jobs`, `outbox_events`, worker retry/dead-letter | outbox has no external dispatcher yet |
| 4 Realtime | Implemented | `RealtimeRegistry`, `RealtimeFanout`, bounded queues | legacy globals remain compatibility views |
| 5 RBAC/audit | Implemented | `AccessDecision`, access policy, audit repository/service | old audit helper has unreachable code |
| 6 Billing/CRM isolation | Implemented with caveats | billing/CRM jobs and aliases | `modules/usage/jobs.py` duplicates old combined logic |
| 7 Module registry | Implemented | `ModuleManifest`, `register_modules`, `/health/modules` | only billing/training manifests are present |
| 8 Observability/load | Partial | metrics and peak tests exist | no real load proof included in audit run |
| 9 Delivery | Mostly implemented | release scripts, manifest, backup, rollback scripts | deploy symlink switches before migration/health |

## Findings To Review First

1. `server/src/db/usage_log.py` still synchronously calls `create_captcha_records()` from
   `fail_usage()`. This violates the rule that `/fail-usage` must not wait for side jobs.
2. `/solve-captcha` smoke flow does not put a session into pending within 2s in the focused
   tests; diagnostic polling saw pending appear at about 5.6s. This threatens the 300 ms
   display-dispatch target.
3. `server/src/modules/usage/jobs.py` contains old combined CRM/billing job handlers while
   `modules/crm/jobs.py` and `modules/billing/jobs.py` now own the split model.
4. `server/src/db/audit_log.py` has dead code after early returns.
5. `AGENTS.md` still documents removed/old `server/src/routes.py` behavior.
6. Generated `__pycache__` and `.pyc` files are present in the worktree directories; they are
   ignored by `.gitignore` but should not be staged.

## Final Audit Verdict

| Area | Verdict | Why |
|---|---|---|
| Protected core dependency boundary | Pass | Import-linter keeps `server.src.core` from importing side modules and forbidden finance/admin/plugin dependencies. |
| Captcha runtime extraction | Pass with adapter debt | `/solve-captcha` and `/solve` delegate to `CaptchaRuntime`; icon-click distribution remains adapter wiring. |
| Peak-path side-work isolation | Partial | Archive, metadata, CRM, and billing are deferrable; `/fail-usage` still does synchronous captcha-record parsing. |
| Realtime fanout | Pass | `RealtimeRegistry` + `RealtimeFanout` use bounded queues and nonblocking writes; legacy globals remain compatibility views. |
| Durable jobs/outbox | Pass with maturity gap | Queue, retry, dead-letter, and lifecycle outbox events exist; no external outbox dispatcher is audited yet. |
| RBAC/audit | Pass with cleanup debt | Access policy and `AuditService` centralize decisions; legacy audit helper contains unreachable old code. |
| Billing/CRM isolation | Pass with alias debt | Split billing/CRM jobs exist and old job names are aliased; `modules/usage/jobs.py` still contains duplicate old handlers. |
| Module registry | Pass for pilot modules | Optional manifests load defensively; only billing/training are represented as manifests now. |
| Deployment/rollback | Mostly pass | Release manifests, backups, restore, and release-targeted rollback exist; candidate symlink switches before migration/health. |
| Frontend/admin product readiness | Needs product confirmation | Admin views must tolerate async-enriched rows and pending billing fields. |
| Extension/plugin release model | Decided, implementation pending | Plugin-only releases should be separate from backend/server releases when backend did not change. |

## Remediation Backlog

| Priority | Item | Type | Requires owner answer? |
|---|---|---|---|
| P0 | Profile `/solve-captcha` before pending insertion; smoke diagnostics saw about 5.6s before pending. | performance/architecture | no |
| P0 | Decide and implement `/fail-usage` deferred captcha-record parsing. | architecture/product | yes |
| P1 | Remove unreachable code in `server/src/db/audit_log.py`. | technical cleanup | no |
| P1 | Update stale `AGENTS.md` references to old `server/src/routes.py`. | documentation cleanup | no |
| P1 | Persist release diff artifacts instead of printing diff only. | delivery hardening | no |
| P1 | Adjust plugin-only release flow so backend/server is not touched when backend did not change. | delivery/product | decision made |
| P2 | Split `modules/usage/jobs.py` into focused notification/captcha-record modules. | architecture cleanup | partially |
| P2 | Remove `usage_enrich` and `billing_confirm` aliases in a planned blocking release after stopping workers/processes and handling old queued rows. | operations | decision made |
| P2 | Make `Operator.online` a volatile realtime concept and reduce/remove DB-source-of-truth coupling. | product/architecture | decision made |
| P3 | Audit duplicate migration roots and offline lab scripts before moving or archiving them. | repository hygiene | no, but high caution |

## Requirement Completion Audit

| Requirement | Evidence | Result |
|---|---|---|
| Assess git state, branch, commits | `git status --short --branch`, `git branch --show-current`, `git log -n 12` were inspected | Complete |
| Identify implemented phases | Phase coverage table above, layer review in `architecture.md` | Complete |
| Map current layers/modules | CodeGraph status plus `architecture.md` layer table | Complete |
| Find legacy/dead/duplicating code | `legacy-cleanup.md` candidate matrix | Complete for audit; deletion pending approval |
| Show candidate usage/imports/endpoints/jobs/risk/action | `legacy-cleanup.md` has structural and literal evidence columns | Complete for initial candidate list |
| Verify non-negotiable rules | `architecture.md` rule table plus test/import evidence | Complete with open findings |
| Create required wiki pages | six files under `docs/wiki/` | Complete |
| Include required Mermaid diagrams | `architecture.md`, `entities.md`, `flows.md`, `deployment.md` | Complete |
| Entity walkthrough | `entities.md` covers requested entities and invariants | Complete as documentation |
| Interactive entity/product validation | Questions below are waiting for owner answers | Pending user confirmation |
| Avoid deleting code before approval | No source deletion performed | Complete |

## Interactive Review Queue

Please confirm these business expectations before cleanup or migrations:

1. Answered: failed usage (`/fail-usage`) may delay captcha record indexing through a worker.
2. Answered: `UsageLog.price` may stay `NULL` until billing jobs calculate it later.
3. Answered: operator `online` is volatile realtime state derived from live SSE connections.
4. Answered: a large blocking release may break backward compatibility; old job aliases can be
   removed in that kind of release after stopping workers/processes and handling old queued rows.
5. Answered: plugin-only releases should be separate; if the backend did not change, do not touch
   or risk the server.

## Owner Decision Matrix

| Decision | Blocks | Decision / safe default | Cleanup enabled after answer |
|---|---|---|---|
| Failed captcha records: immediate vs deferred | `/fail-usage` migration | Decided: delayed worker indexing is acceptable | Move failed parsing to `captcha_records` job |
| Async billing fields in reports | admin/reporting product semantics | Decided: `UsageLog.price` may be calculated later | Tune admin UI/report labels and job retry SLA |
| Operator online source of truth | realtime cleanup and DB writes | Decided: volatile realtime registry is the source of truth | Remove/reduce persisted `online` coupling |
| Legacy job aliases retention | removal of `usage_enrich` / `billing_confirm` duplicates | Decided: incompatible blocking release is allowed after stopping workers/processes and handling old queued rows | Delete duplicate handlers in a planned major/blocking release |
| Plugin-only release identity | delivery history and rollback semantics | Decided: plugin-only release should be separate and should not touch backend/server if backend did not change | Refactor plugin release flow away from server-risking release switch |
| Admin role compatibility window | RBAC hardening | Missing `admin_role` remains `super_admin` | Add migration/expiry policy for old admin keys |
| Tariff timing for unpriced rows | billing reconciliation semantics | Billing jobs price using current tariff at job execution time | Add tariff snapshot if historical pricing is required |

## Cleanup Actions That Do Not Need Business Approval

These are low-risk technical hygiene items, but still should be reviewed before deleting files:

- Remove unreachable code after `return` in `server/src/db/audit_log.py` while keeping wrapper
  functions.
- Update stale `AGENTS.md` references from `server/src/routes.py` to the route package.
- Remove generated `__pycache__` and `.pyc` files from the workspace if any are accidentally
  tracked or staged.
- Add persisted release diff artifacts to deploy scripts without changing deploy semantics.

## Cleanup Actions That Need Approval First

- Moving lab scripts or duplicate migration roots.
- Removing legacy job handler code or old job aliases outside a planned blocking release.
- Changing plugin-only release behavior in a way that risks backend/server when backend did not change.

## Approved Design Decisions Pending Implementation

- Change `/fail-usage` from immediate captcha record creation to deferred worker parsing.
- Allow `UsageLog.price` to remain empty until billing jobs calculate it.
- Treat operator online/offline presence as volatile realtime state, not DB source of truth.
- Allow a planned blocking/non-backward-compatible release for old job alias removal, including
  stopping workers/processes and explicitly handling old queued rows.
- Keep plugin-only releases separate from backend/server releases when backend code did not change.
