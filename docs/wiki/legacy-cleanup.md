# Legacy Cleanup Status

Updated: 2026-06-15.

This page tracks compatibility code that was audited during the legacy cleanup
goal. Items in "Cleaned" were changed in code; items in "Retained" are still
intentional compatibility surfaces.

## Cleaned

| Item | Current state | Evidence |
|---|---|---|
| `/fail-usage` captcha record parsing | Failed usage now enqueues `captcha_records` instead of calling `create_captcha_records()` synchronously. | `server/src/db/usage_log.py`; `tests/test_outbox_jobs.py::test_fail_usage_defers_captcha_record_parsing` |
| `/confirm-usage` sync side-work flags | `sync_billing` and `sync_captcha_records` remain accepted by DB/repository adapters, but confirmation always enqueues durable jobs. | `server/src/db/usage_log.py`; `tests/test_outbox_jobs.py::test_confirm_usage_sync_flags_are_compatibility_only` |
| Confirmed-usage Telegram notification | Route code always enqueues `telegram_confirmed_usage`; it no longer calls Telegram synchronously when sync billing is enabled. | `server/src/services/usage_service.py`; `tests/test_outbox_jobs.py::test_confirm_usage_defers_telegram_even_when_sync_flag_enabled` |
| `server/src/modules/usage/jobs.py` mixed CRM/billing handlers | Old `enrich_usage_config()` and `confirm_billing()` functions were removed. CRM and billing aliases remain registered in their owning modules. | `server/src/modules/crm/jobs.py`, `server/src/modules/billing/jobs.py`; `tests/test_outbox_jobs.py::test_default_registry_keeps_legacy_aliases_on_current_modules` |
| `server/src/db/audit_log.py` unreachable SQLite code | Wrapper functions now delegate directly to `AuditRepository`; unreachable post-return SQL was removed. | `server/src/db/audit_log.py` |
| `server/src/db/captchas.py` duplicate return | Removed duplicated `return []` in `create_captcha_records()`. | `server/src/db/captchas.py` |
| Admin legacy query-tab route | `/admin?tab=...` redirect support was removed; the admin shell uses the current `/admin/:tabId` route contract. | `frontend/src/features/admin/AdminPage.jsx`; `frontend/src/features/admin/shared/tabs.js`; `frontend/src/features/admin/shared/tabs.test.mjs` |
| Captcha home side-tab test wording | The test no longer preserves the old `captchas` side-tab example; unknown values still normalize to `chat`. | `frontend/src/features/captcha/solving/homeTabs.test.mjs` |
| Admin user modal `AccessBlockV2` | Removed the unused old `AccessBlock` implementation and made the current two-list access picker the only `AccessBlock`. | `frontend/src/features/admin/users/UserModal.jsx`; `frontend/src/features/admin/users/UserModal.layout.test.mjs` |
| Stale frontend source-inspection tests | Replaced old brittle assertions for the default-tariff button label and Ant Design import shape with current contract checks. | `frontend/src/features/admin/companies/companyExecutorTariff.test.mjs`; `frontend/src/features/admin/users/UserModal.layout.test.mjs`; `npm test` in `frontend/` |
| `PROTECTED_PATHS` candidate | The old path-list constant is not present in current code; CodeGraph and literal search found no source/test usages. | `server/src/constants.py`; `codegraph_impact("PROTECTED_PATHS")`; `rg "PROTECTED_PATHS"` |
| `server/src/domain/*` re-export shells | Removed unused `__init__.py` facade modules that only re-exported services. The README files remain as change-map documentation. | `server/src/domain/*/README.md`; `rg "src.domain"`; CodeGraph file map |
| Admin API-key bearer interpretation | Documentation now matches runtime: API keys are not admin bearer tokens; the old admin key is only a bootstrap password for the migrated `admin` password user. | `server/src/modules/access/service.py`; `tests/test_rbac_audit.py::test_access_service_maps_password_sessions_to_permissions`; `tests/test_user_roles.py::test_legacy_admin_api_key_is_migrated_to_user_account_but_not_used_as_admin_token` |
| Stale RBAC/user-role tests | Updated tests from old API-key tariffs, unpaid payout setup, cross-company personal plugin keys, and old tariff response shape to current company-tariff, paid-invoice payout, scoped personal key, and operator/executor amount contracts. | `tests/test_rbac_audit.py`; `tests/test_user_roles.py`; `uv run pytest tests/test_rbac_audit.py tests/test_user_roles.py -q` |
| Extension top-level captcha `variants` response | Removed the old extension adapter branch for `{ variants: [{ tiles }] }`. Captcha generation now accepts the current EOPP v2 `front` shape and the internal `puzzle` shape only. | `extension/src/api/stages.ts`; `server/src/routes/mock.py`; `server/tests/test_api_routes.py::test_mock_captcha_returns_eopp_front_payload` |
| Stale architecture-design document | Replaced the old future-state `domains/*/routes.py` and EventBus migration sketch with the current `server/src/routes/*`, durable-job, frontend, extension, and migration contracts. | `docs/architecture-design.md` |

## Backfills

| Backfill | Result | Evidence |
|---|---|---|
| Local captcha-record queue backfill for v2 `usage_log` rows without parsed captcha records | Backed up `server/data/api_keys.db`, enqueued 98 `captcha_records` jobs, processed 98 successfully, and added 10 captcha rows. Queue state is clean: 98 done jobs, no pending/running/failed/dead jobs, and no old `usage_enrich` / `billing_confirm` rows. Remaining `config_json` rows without captcha records are rows without parseable captcha events: 11 confirmed test rows, 117 failed rows, and 5 pending rows. | Backup: `server/data/backups/before-legacy-captcha-records-20260615_202636/api_keys.db`; DB audit query on `background_jobs`, `usage_log`, `captchas` |
| Local billing price audit | No production confirmed usage rows remain with `price IS NULL`; the 71 unpriced confirmed rows are test rows and are intentionally skipped by billing. | DB audit query on `usage_log.status`, `usage_log.price`, `usage_log.is_test` |

## Retained Compatibility

| Surface | Why it remains |
|---|---|
| Job names `usage_enrich` and `billing_confirm` | Existing queued production rows may still use these names. They are aliases to `crm.enrich_usage` and `billing.calculate_usage_price`. |
| `server/src/db/audit_log.py` helper names | Older code may import `log_audit()` / `list_audit_log()`, but the implementation uses the current audit repository. |
| `src.sse` legacy globals | Admin/health/distribution code still reads compatibility views; new realtime work should use `RealtimeRegistry`. |
| `CaptchaSession` dict-like API | Legacy adapters still expect mapping-style pending session access. |

## Remaining Candidates

| Candidate | Risk | Next action |
|---|---|---|
| Duplicate migration roots | Closed for current tree: only `server/migrations/versions` exists and `server/alembic.ini` uses `script_location = %(here)s/migrations`. | Historical docs may still mention old root-relative examples; do not create new revisions outside `server/migrations/versions`. |
| Offline classifier/solver lab scripts under `scripts/` | Medium; manually invoked tooling may still depend on them. | Move to a clearly named lab/tooling area or document as retained offline tools. |
| Mixed legacy service modules under `server/src/services/*` | High; routes still import these heavily. | Migrate gradually behind modules/repositories, one endpoint family at a time. |

## Verification Focus

After touching this area, run:

- `uv run pytest tests/test_outbox_jobs.py tests/test_billing_isolation.py`
- `uv run pytest server/tests/test_core_smoke.py -k confirm_usage`
- `node --test src/features/admin/shared/tabs.test.mjs src/features/captcha/solving/homeTabs.test.mjs` from `frontend/`
- `npm test` from `frontend/`
- `npm run typecheck` and `npm run build` from `extension/` after extension contract changes
- `uv run lint-imports`
