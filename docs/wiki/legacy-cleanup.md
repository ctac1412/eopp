# Legacy Cleanup Candidates

No code was deleted during this audit. The table below is the candidate list for approval.

| Candidate | Structural evidence | Literal/dynamic evidence | Endpoint/job/event dependency | Risk | Recommended action |
|---|---|---|---|---|---|
| `server/src/db/usage_log.py::fail_usage` sync `create_captcha_records()` | CodeGraph reports duplicated `fail_usage` symbols and does not resolve this dynamic chain reliably | `routes/usage.py -> usage_service.fail_usage() -> usage_log_repo.fail_usage() -> db.usage_log.fail_usage()`; direct import at `server/src/db/usage_log.py:331` | `/fail-usage`; `captchas` table/file indexing side effect | Medium: failure/log parsing can block or break fail hot path | migrate to `enqueue_deferred_job("captcha_records", {"usage_log_id": id, "status": "failed"})` |
| `server/src/modules/usage/jobs.py::confirm_billing` | CodeGraph did not find the symbol as a caller target because job handlers are string-registered | `billing_confirm` idempotency key still exists; `modules/billing/jobs.py` already registers `billing_confirm` alias to split billing flow | old queued `billing_confirm` rows | Low/medium: removal can strand old jobs if production queue still has them | deprecate; keep alias in billing module; remove duplicate handler only after queue drain |
| `server/src/modules/usage/jobs.py::enrich_usage_config` | CodeGraph did not find the symbol as a caller target because job handlers are string-registered | `modules/crm/jobs.py` already registers `usage_enrich` alias to the new CRM handler | old queued `usage_enrich` rows | Low/medium | deprecate; keep CRM alias; remove duplicate handler after queue drain |
| `server/src/modules/usage/jobs.py` as mixed side-work module | Worker imports `src.modules.usage.jobs.register_jobs`; CodeGraph impact for module-level symbol is weak because import is inside function | literal registrations: `captcha_records`, `telegram_confirmed_usage`; old combined functions still present | worker jobs, Telegram notification, captcha record parsing | Medium: file still owns useful handlers but violates module clarity | migrate captcha record parsing to a captcha-record/archive module and telegram to notification module; keep file as alias shell temporarily |
| Dead code in `server/src/db/audit_log.py` after returns | CodeGraph callers for `log_audit` and `list_audit_log`: none found | `log_audit()` returns after `AuditRepository().append_event`; old sqlite code begins at line 30; `list_audit_log()` returns before old query at line 48 | legacy helper names only | Low | delete unreachable code, keep wrapper functions for compatibility |
| `AGENTS.md` references `server/src/routes.py` | documentation file, not code | lines 74 and 251 mention old monolithic route file | none | Low | update docs to route package and `server/src/routes/__init__.py` |
| Generated `__pycache__` / `.pyc` in source/test dirs | not indexed as source symbols | `Get-ChildItem` shows caches under `server/src/core`, `server/src/modules`, `server/src/platform`, `tests` | none | Low | delete generated files after confirmation; ensure not staged |
| Duplicate migration roots `alembic/versions`, `migrations/versions`, `server/migrations/versions` | CodeGraph file map shows all three roots | active app imports `server/migrations/env.py`; deployment runs `python -m alembic` from server compose | Alembic history, deploy/migrate | High if removed blindly | keep; document active tree; archive stale roots only after tooling audit |
| Large experimental `scripts/analyze_*`, `train_*`, `debug_*` | CodeGraph file map shows many standalone script entry points | filenames indicate offline solver/classifier experiments | offline training/analysis only unless manually invoked | Medium | move under `tools/captcha_lab` or mark retained offline tooling |
| `server/src/domain/*` re-export/readme shells | CodeGraph file map shows domain packages; `domain/captcha/__init__.py` re-exports service functions | legacy docs point domain rules back to services | maybe legacy imports | Medium unknown | deprecate or turn into true domain layer after CodeGraph impact on each package |
| Legacy `server/src/services/*` mixed services | CodeGraph contexts show routes import services heavily | `routes/admin.py`, `routes/captcha.py`, `routes/usage.py`, `routes/captchas.py` use service modules | many HTTP endpoints | High | keep; migrate gradually behind modules/repositories |
| `PROTECTED_PATHS` in `constants.py` | old constant, central access policy now exists | no structural proof of full replacement in this audit | legacy auth compatibility | Low/medium | keep until middleware/access policy fully covers old protected paths |

## Dependency Notes

- `create_captcha_records` is directly tested in `server/tests/test_api_routes.py` and used by
  `modules/usage/jobs.py::parse_captcha_records`.
- New enqueue sites are in:
  - `captcha_file_service`: `captcha_archive`, `captcha_metadata`
  - `usage_log_repo`: `crm.enrich_usage`
  - `db/usage_log.confirm_usage`: `billing.calculate_usage_price`, `captcha_records`
  - `usage_service.confirm_usage`: `telegram_confirmed_usage`
  - `billing/jobs`: chained billing jobs
- Legacy aliases:
  - `usage_enrich` -> `modules/crm/jobs.enrich_usage`
  - `billing_confirm` -> `modules/billing/jobs.calculate_usage_price`

## CodeGraph Evidence Notes

- `codegraph_impact("CaptchaSessionStore")` reports impact through `server/src/routes/captcha.py::_session_store`.
- `codegraph_impact("RealtimeRegistry")` reports impact through `server/src/sse/manager.py::registry`.
- `codegraph_impact("AccessService")` reports impact through `server/src/policies/access_policy.py::_access_service`.
- `codegraph_callers("log_audit")` and `codegraph_callers("list_audit_log")` found no structural callers.
- Dynamic imports and string job registrations are intentionally documented with literal evidence because
  AST call graphs do not model string-dispatched job names.

## Recommended Cleanup Order

1. Fix `/fail-usage` to enqueue failed captcha record parsing.
2. Profile `/solve-captcha` pre-pending latency and fix the root cause.
3. Remove unreachable code from `db/audit_log.py`.
4. Decide production queue retention window for `usage_enrich` and `billing_confirm`.
5. Split remaining `modules/usage/jobs.py` into focused notification/captcha-record modules.
6. Update `AGENTS.md` route documentation.
7. Remove generated caches and verify git status.
8. Only after tooling audit, decide fate of duplicate migration roots and lab scripts.
