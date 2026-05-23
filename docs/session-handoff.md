# Session Handoff

Updated: 2026-05-23 MSK

## Start Rules

- Work in `D:\Projects\eopp`.
- First read `AGENTS.md`, `docs/task-todo.md`, `docs/implementation-plan.md`, and this file.
- Run `git status --short` before editing. The worktree currently has many staged user changes; do not revert, unstage, or commit unrelated files.
- Do not deploy, push, publish CRX, update plugin release artifacts, or bump plugin versions unless explicitly requested.
- `codegraph` was connected by the user and `.codegraph/` exists, but the previous session did not have a callable codegraph tool exposed via `tool_search`.

## Completed Commits

- `283f3f1 Implement shared slots coordination`
- `234c529 Improve finance admin tabs`
- `cfe74ce Fix captcha example validation`
- `8534770 Improve extension configuration UI`

## Current Priority

Continue task B1: tariff pricing by time.

Business rule:
- normal create uses `price_create`;
- reschedule uses `price_reschedule`;
- create confirmed at 12:00 MSK should use a higher "peak create" price;
- fallback for 12:00 create is `price_reschedule` if dedicated peak price is not configured.

Do this carefully because billing touches DB, admin UI, and usage confirmation.

## Current Worktree Notes

There are many staged changes that appear to be user work or generated artifacts. Do not include them in commits unless explicitly instructed.

Staged files seen in the previous session included:
- `frontend/src/AdminPage.jsx`
- `frontend/src/components/admin/ReportsTab.jsx`
- `frontend/src/components/admin/StreamsTab.jsx`
- `frontend/src/components/history/HistoryRow.jsx`
- `plugins/my-helper-v1.4.0.crx`
- `plugins/update.xml`
- `src/models.py`
- `src/routes/admin.py`
- `src/routes/frontend.py`
- `src/routes/slots.py`
- `src/services/slots_group_service.py`
- many `yandex-browser-plugin/src/*` files

Unstaged partial B1 files seen in the previous session:
- `migrations/versions/8814b9cb1e05_initial_schema.py`
- `src/db/api_keys.py`
- `src/db/tariffs.py`
- `src/db/usage_log.py`
- `src/repositories/billing_repo.py`
- `src/services/billing_service.py`

Untracked:
- `.codegraph/`
- `migrations/versions/b8c9d0e1f2a3_tariff_peak_create_price.py`

Important: `src/models.py` already contains `TariffBody.price_create_peak`, but that file was staged among user changes. Inspect before using it in a commit.

## B1 Partial Implementation Already Done

- Added `price_create_peak: int | None = None` to `TariffBody` in `src/models.py`.
- Extended tariff DB mapping in `src/db/tariffs.py` with `price_create_peak`.
- Extended API key tariff map in `src/db/api_keys.py`.
- Extended repository/service upsert path in:
  - `src/repositories/billing_repo.py`
  - `src/services/billing_service.py`
- Added peak pricing calculation in `src/db/usage_log.py`:
  - uses `Europe/Moscow`;
  - `mode == "reschedule"` uses `price_reschedule`;
  - `mode == "create"` at hour `12` uses `price_create_peak` or falls back to `price_reschedule`;
  - other creates use `price_create`.
- Added `price_create_peak INTEGER` to initial migration.
- Added new migration `migrations/versions/b8c9d0e1f2a3_tariff_peak_create_price.py`.

## B1 Next Steps

1. Inspect staged/unstaged diff, especially `src/models.py` and `frontend/src/AdminPage.jsx`.
2. Finish admin UI for `price_create_peak`:
   - `frontend/src/AdminPage.jsx`
   - `frontend/src/components/admin/ApiKeysTab.jsx`
   - `frontend/src/components/admin/KeyFormModal.jsx`
3. Add or update tests:
   - tariff CRUD includes `price_create_peak`;
   - API key tariff payload includes it;
   - usage confirmation applies 12:00 MSK peak pricing;
   - fallback to `price_reschedule` when peak price is empty.
4. Run relevant tests:
   - backend billing/admin tests;
   - frontend build or typecheck if UI changed.
5. Commit only B1 files, avoiding unrelated staged user work.

## Completed Feature Context

### Shared Slots

Implemented first because it was the highest priority.

Backend:
- `src/services/slots_group_service.py`
- `src/routes/slots.py`
- routes registered in `src/routes/__init__.py`

Endpoints:
- `/slots-group/claim`
- `/slots-group/publish`
- `/slots-group/wait`
- `/slots-group/fail`
- `/slots-group/stats`

Extension:
- feature toggle in popup config;
- `sharedSlotsEnabled`;
- `sharedSlotsWaitMs`, default `1600`;
- group key is based on exact `AvailableSlots` request fingerprint;
- fallback to direct EOPP fetch on timeout or failure.

Verified previously:
- `cmd /c npm run typecheck` in `yandex-browser-plugin`
- `uv run pytest tests/test_api_routes.py -k SlotsGroup`

### Finance Admin Tabs

Improved invoices, expenses, and payouts:
- filters;
- analytics summaries;
- richer table layouts;
- improved visual hierarchy.

Files included:
- `frontend/src/components/admin/InvoicesTab.jsx`
- `frontend/src/components/admin/ExpensesTab.jsx`
- `frontend/src/components/admin/PayoutsTab.jsx`

Verified previously:
- `npm run build` in `frontend` passed.

### Captcha Benchmark Validation

Fixed benchmark/example validation:
- `valid_index: 0` is valid;
- missing, null, non-integer, or out-of-range `valid_index` is invalid;
- benchmark skips invalid examples;
- manual save routes no longer treat key presence as validity.

Files included:
- `src/utils.py`
- `src/routes/captcha.py`
- `src/routes/admin.py`
- `tests/test_captcha_validation.py`

Local ignored data cleanup:
- 41 JSON examples were moved from `data/captcha_examples/valid` to `data/captcha_examples/no_valid` because they had `valid_index: null`.

Verified previously:
- `uv run pytest tests/test_captcha_validation.py tests/test_solve_captcha.py`

### Extension UI

Improved plugin popup:
- advanced settings collapsed by default;
- mode/date remain visible;
- quick date chips;
- less clutter in normal path.

Files included:
- `yandex-browser-plugin/src/components/ConfigForm.tsx`
- `yandex-browser-plugin/src/store.ts`
- `yandex-browser-plugin/src/types.ts`

Plugin version was bumped to `1.3.8` during that task according to plugin `AGENTS.md`.

Verified previously:
- `npm run typecheck`
- `npm run build`

## Remaining Planned Work After B1

- B2: open invoice flow, where company usage accumulates into an open invoice until issued.
- B3: prepaid packages / balances with usage write-off.
- C1: Telegram bot for run start/finish notifications.
- C2: scheduled daily report, e.g. 12:03 MSK summary and revenue.
- D1: captcha labeling/training mode from frontend.
- D2: captcha training mode with longer time and mixed difficulty.
- E1: broader plugin frontend redesign ideas, possibly hiding settings by default.

## Useful EOPP Context

The site performs a preliminary available-dates request before slots:

`GET /reservations-api/v1/timeslot/AvailableDates?facilityId=...&fromDate=2026-05-22&transportType=1&vehicleId=...`

Example response:

```json
[
  "2026-05-22",
  "2026-05-23",
  "2026-05-24",
  "2026-05-25",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28"
]
```

For now the user asked not to intercept this yet. First create internal contracts and calls; later decide whether to integrate into the pipeline.
