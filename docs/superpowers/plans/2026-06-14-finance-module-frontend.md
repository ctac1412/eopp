# Finance Module Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usable admin frontend for the finance ledger module with three views, search/filtering, and safe editing of editable finance records.

**Architecture:** Add one top-level admin tab, `finance`, implemented as a focused feature module under `frontend/src/features/admin/finance/`. The tab contains three internal views: ledger entries, profit lots, and finance report/reconciliation. Keep data access in a small API client instead of adding more fetch/state weight to `frontend/src/AdminPage.jsx`.

**Tech Stack:** React 18, Vite, Ant Design 6, existing admin session auth, existing `/admin/*` FastAPI endpoints.

---

## Product Shape

Build one admin tab named `finance` ("Финансы") with three internal segmented views:

1. **Ledger / Проводки**
   - Entity: `finance_entries`.
   - Purpose: searchable accounting ledger for income, commissions, taxes, operator/executor/director payouts, expense repayments, manual adjustments.
   - Actions: create manual adjustment, edit open/unpaid entry, delete open/unpaid entry.
   - Read-only states: entries with `edit_state !== "open"` or `payout_id != null`.

2. **Profit Lots / Лоты прибыли**
   - Entity: `profit_lots`.
   - Purpose: show invoice-scoped gross profit lots and how they are allocated/consumed by director profit and expense repayment entries.
   - Actions: no direct mutation by default, because lots are derived from invoice-linked ledger entries. Provide links/filters to related ledger entries and invoice/payout ids. If editing is required later, edit through ledger manual adjustment or invoice recalculation, not direct lot mutation.

3. **Report / Сводка**
   - Endpoint: `/admin/finance-report`.
   - Purpose: date-range summary by kind, user, company, and open/locked/paid states.
   - Actions: filter by date range, drill into ledger rows by clicking summary buckets.

Search must be present in all views. For v1, use client-side text search on the loaded page plus server-side filters where endpoints already support them.

---

## Existing Backend API

Use these existing endpoints:

- `GET /admin/finance-entries?company_id=&usage_log_id=&invoice_id=&payout_id=&kind=&edit_state=`
- `POST /admin/finance-entries`
- `PUT /admin/finance-entries/{id}`
- `DELETE /admin/finance-entries/{id}`
- `GET /admin/finance-report?start=&end=`
- `GET /admin/companies`
- `GET /admin/finance-participants`
- `GET /admin/invoices`
- `GET /admin/payouts`

Required small backend addition:

- `GET /admin/profit-lots?company_id=&usage_log_id=&invoice_id=&payout_id=&status=`

Return each profit lot with:

```json
{
  "id": 1,
  "company_id": 1,
  "usage_log_id": 642,
  "invoice_id": 7,
  "gross_amount": 1200,
  "created_at": "2026-06-14T10:00:00",
  "updated_at": "2026-06-14T10:00:00",
  "allocated_amount": 400,
  "remaining_amount": 800,
  "linked_entries_count": 2,
  "invoice_number": "INV-20260614100000",
  "company_name": "Company"
}
```

No `PUT`/`DELETE` for `profit_lots` in v1.

---

## File Structure

Create:

- `frontend/src/features/admin/finance/financeApi.js`
  - All finance API fetches.
  - Accepts `adminToken`, returns plain JSON.

- `frontend/src/features/admin/finance/financeFormat.js`
  - Labels for finance entry kinds and edit states.
  - Money/date formatting helpers.
  - Search predicates shared by the three views.

- `frontend/src/features/admin/finance/FinanceTab.jsx`
  - The shell for the three internal views.
  - Owns tab state, common reference data, date range, refresh button, and error callback.

- `frontend/src/features/admin/finance/FinanceFilters.jsx`
  - Shared compact filter bar: search, company, kind, edit state, invoice id, payout id, usage id.

- `frontend/src/features/admin/finance/FinanceEntriesView.jsx`
  - Ledger table and create/edit/delete actions.

- `frontend/src/features/admin/finance/FinanceEntryModal.jsx`
  - Form for `FinanceEntryBody` and `UpdateFinanceEntryBody`.

- `frontend/src/features/admin/finance/ProfitLotsView.jsx`
  - Profit lot table, allocation columns, and drill-down buttons.

- `frontend/src/features/admin/finance/FinanceReportView.jsx`
  - Summary cards/table for `/admin/finance-report`.

- `frontend/src/features/admin/finance/index.js`
  - Re-export `FinanceTab`.

- `frontend/src/features/admin/finance/financeFormat.test.mjs`
  - Unit tests for labels, money formatting, and search predicates.

- `frontend/src/features/admin/finance/financeApi.test.mjs`
  - Unit tests for query-string construction and payload normalization if existing test setup makes fetch mocking easy. If fetch mocking is not already used, keep API construction pure and test that pure function.

- `server/tests/test_admin_profit_lots_api.py`
  - Backend coverage for the new read-only profit lot endpoint.

Modify:

- `frontend/src/features/admin/shared/tabs.js`
  - Add `{ id: "finance", label: "Финансы" }` near invoices/expenses/payouts.

- `frontend/src/components/admin/index.js`
  - Export `FinanceTab`.

- `frontend/src/AdminPage.jsx`
  - Import `FinanceTab`.
  - Add `finance` to manager default sections.
  - Render `FinanceTab` when `activeTab === "finance"`.
  - Avoid adding finance table state here; pass only `adminToken` and `onError`.

- `server/src/db/finance.py`
  - Add `list_profit_lots(filters: dict | None = None) -> list[dict]`.

- `server/src/services/billing_service.py`
  - Add `list_profit_lots(filters: dict | None = None) -> tuple[int, list[dict]]`.

- `server/src/routes/admin.py`
  - Add `GET /admin/profit-lots`.

---

## Task 1: Backend Profit Lots Read API

**Files:**
- Modify: `server/src/db/finance.py`
- Modify: `server/src/services/billing_service.py`
- Modify: `server/src/routes/admin.py`
- Test: `server/tests/test_admin_profit_lots_api.py`

- [ ] **Step 1: Write backend test**

Create `server/tests/test_admin_profit_lots_api.py` with a test that:

1. Uses `client` and `admin_token` fixtures.
2. Inserts one company, one invoice, one usage log, one `profit_lots` row.
3. Inserts one linked `finance_entries` row against that lot.
4. Calls `GET /admin/profit-lots`.
5. Asserts status `200`, one row, `allocated_amount`, `remaining_amount`, and `linked_entries_count`.

Expected command:

```powershell
uv run pytest server/tests/test_admin_profit_lots_api.py -q
```

Expected before implementation: fail with `404` or missing route.

- [ ] **Step 2: Implement `list_profit_lots`**

Add a query in `server/src/db/finance.py` that joins `profit_lots`, `invoices`, `companies`, and aggregated `finance_entries` by `profit_lot_id`.

Rules:

- `allocated_amount = SUM(ABS(finance_entries.amount))` for linked entries.
- `remaining_amount = gross_amount - allocated_amount`.
- Filters: `company_id`, `usage_log_id`, `invoice_id`.
- `status=open` means `remaining_amount > 0`.
- `status=allocated` means `remaining_amount <= 0`.
- Sort newest first by `profit_lots.created_at`, then `id`.

- [ ] **Step 3: Wire service and route**

Add `billing_service.list_profit_lots()` and route:

```python
@router.get("/profit-lots")
async def list_admin_profit_lots(
    company_id: int | None = None,
    usage_log_id: int | None = None,
    invoice_id: int | None = None,
    status: str | None = None,
):
    return _json_result(
        billing_service.list_profit_lots(
            {
                "company_id": company_id,
                "usage_log_id": usage_log_id,
                "invoice_id": invoice_id,
                "status": status,
            }
        )
    )
```

- [ ] **Step 4: Verify backend**

Run:

```powershell
uv run pytest server/tests/test_admin_profit_lots_api.py server/tests/test_finance_entries_flow.py -q
uv run lint-imports
```

Expected: all pass, protected-core contract kept.

- [ ] **Step 5: Commit**

```powershell
git add server/src/db/finance.py server/src/services/billing_service.py server/src/routes/admin.py server/tests/test_admin_profit_lots_api.py
git commit -m "Add admin profit lots API"
```

---

## Task 2: Finance Frontend API And Formatting

**Files:**
- Create: `frontend/src/features/admin/finance/financeApi.js`
- Create: `frontend/src/features/admin/finance/financeFormat.js`
- Create: `frontend/src/features/admin/finance/financeFormat.test.mjs`
- Optional test: `frontend/src/features/admin/finance/financeApi.test.mjs`

- [ ] **Step 1: Create format helpers**

Implement:

- `FINANCE_KIND_LABELS`
- `EDIT_STATE_LABELS`
- `formatMoney(value)`
- `formatDateTime(value)`
- `matchesFinanceSearch(row, query)`

Search should match ids, kind label, comment, source, source key, company name, invoice number, and user name when present.

- [ ] **Step 2: Test format helpers**

Add tests for:

- `formatMoney(1200)` returns a ruble-style value.
- `formatMoney(null)` returns `—`.
- `matchesFinanceSearch` matches by `comment`, `invoice_number`, and translated kind label.
- empty search returns `true`.

Run:

```powershell
cd frontend
node src/features/admin/finance/financeFormat.test.mjs
```

- [ ] **Step 3: Create API client**

Implement functions:

- `listFinanceEntries(adminToken, filters)`
- `createFinanceEntry(adminToken, payload)`
- `updateFinanceEntry(adminToken, id, payload)`
- `deleteFinanceEntry(adminToken, id)`
- `listProfitLots(adminToken, filters)`
- `getFinanceReport(adminToken, filters)`
- `listCompanies(adminToken)`
- `listFinanceParticipants(adminToken)`

Use existing `adminHeaders` and `adminHeadersJson` from `frontend/src/features/admin/shared/adminClient.js`.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/features/admin/finance
git commit -m "Add finance admin frontend client"
```

---

## Task 3: Finance Tab Shell And Navigation

**Files:**
- Create: `frontend/src/features/admin/finance/FinanceTab.jsx`
- Create: `frontend/src/features/admin/finance/index.js`
- Modify: `frontend/src/features/admin/shared/tabs.js`
- Modify: `frontend/src/components/admin/index.js`
- Modify: `frontend/src/AdminPage.jsx`

- [ ] **Step 1: Add tab registration**

Add `{ id: "finance", label: "Финансы" }` in `ADMIN_TABS` next to `invoices`, `expenses`, and `payouts`.

Add `finance` to `DEFAULT_ROLE_SECTIONS.manager`.

- [ ] **Step 2: Create `FinanceTab` shell**

The shell should render:

- compact header with refresh button
- Ant Design segmented control with:
  - `ledger`
  - `lots`
  - `report`
- shared date/search state only where useful
- child view placeholders at first

Use a dense admin-tool layout, no marketing copy, no nested cards.

- [ ] **Step 3: Wire AdminPage**

Import `FinanceTab` and render:

```jsx
{activeTab === "finance" && (
  <FinanceTab adminToken={adminToken} onError={(msg) => setError(msg)} />
)}
```

- [ ] **Step 4: Build check**

Run:

```powershell
cd frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/AdminPage.jsx frontend/src/components/admin/index.js frontend/src/features/admin/shared/tabs.js frontend/src/features/admin/finance
git commit -m "Add finance admin tab shell"
```

---

## Task 4: Ledger Entries View

**Files:**
- Create: `frontend/src/features/admin/finance/FinanceFilters.jsx`
- Create: `frontend/src/features/admin/finance/FinanceEntriesView.jsx`
- Create: `frontend/src/features/admin/finance/FinanceEntryModal.jsx`
- Modify: `frontend/src/features/admin/finance/FinanceTab.jsx`

- [ ] **Step 1: Build shared filters**

Filters:

- search input
- company select
- kind select
- edit state select
- invoice id input
- payout id input
- usage log id input
- reset button

Keep controls compact and stable width. Do not put cards inside cards.

- [ ] **Step 2: Build ledger table**

Columns:

- id
- date
- kind
- amount
- state
- company
- usage
- invoice
- payout
- user
- source
- comment
- actions

Actions:

- edit if open and no payout
- delete if open and no payout
- filter by invoice/payout/usage via small buttons or clickable ids

- [ ] **Step 3: Build modal**

Fields:

- company
- usage_log_id
- invoice_id
- expense_id
- profit_lot_id
- distribution_answer_id
- user
- kind
- amount
- comment

Create defaults:

```js
{
  kind: "manual_adjustment",
  amount: "",
  comment: "",
}
```

On update, omit blank relation ids by sending `null`.

- [ ] **Step 4: Verify locked behavior visually**

Rows with `edit_state !== "open"` or `payout_id` must show disabled action icons with tooltip text explaining why editing is blocked.

- [ ] **Step 5: Build check and commit**

```powershell
cd frontend
npm run build
git add src/features/admin/finance
git commit -m "Add finance ledger view"
```

---

## Task 5: Profit Lots View

**Files:**
- Create: `frontend/src/features/admin/finance/ProfitLotsView.jsx`
- Modify: `frontend/src/features/admin/finance/FinanceTab.jsx`
- Modify: `frontend/src/features/admin/finance/financeApi.js`
- Modify: `frontend/src/features/admin/finance/financeFormat.js`

- [ ] **Step 1: Build profit lots filter bar**

Filters:

- search
- company
- invoice id
- usage log id
- status: all/open/allocated

- [ ] **Step 2: Build profit lots table**

Columns:

- lot id
- invoice
- company
- usage
- gross amount
- allocated amount
- remaining amount
- linked entries count
- created
- actions

Actions:

- "Проводки" sets finance tab internal view to ledger and applies `profit_lot_id` or `invoice_id` filter.
- "Счёт" links back to admin invoices using `?tab=invoices&invoice_id=<id>` if this pattern is already supported.

- [ ] **Step 3: Show clear read-only semantics**

Do not add direct edit/delete buttons for lots. Use a small locked/read-only indicator: "Лот рассчитывается из счёта и проводок".

- [ ] **Step 4: Build check and commit**

```powershell
cd frontend
npm run build
git add src/features/admin/finance
git commit -m "Add finance profit lots view"
```

---

## Task 6: Finance Report View

**Files:**
- Create: `frontend/src/features/admin/finance/FinanceReportView.jsx`
- Modify: `frontend/src/features/admin/finance/FinanceTab.jsx`
- Modify: `frontend/src/features/admin/finance/financeApi.js`
- Modify: `frontend/src/features/admin/finance/financeFormat.js`

- [ ] **Step 1: Build report controls**

Controls:

- start date
- end date
- refresh
- reset to current month

- [ ] **Step 2: Render summary**

Render sections from `/admin/finance-report`:

- totals by kind
- totals by company
- totals by user
- profit lot gross/remaining if present in response

Use tables for dense comparison. Avoid decorative dashboard cards; use compact metric blocks only for top totals.

- [ ] **Step 3: Drill-down into ledger**

Clicking a kind/company/user summary should switch to ledger view and apply corresponding filter/search where backend supports it. If backend lacks a direct filter, set client-side search text.

- [ ] **Step 4: Build check and commit**

```powershell
cd frontend
npm run build
git add src/features/admin/finance
git commit -m "Add finance report view"
```

---

## Task 7: Manual Verification

**Files:**
- No planned code changes unless verification finds issues.

- [ ] **Step 1: Start server**

Run:

```powershell
make run-prod-start
```

Expected: local server listening on `http://127.0.0.1:8766`.

- [ ] **Step 2: Open admin finance tab**

Open:

```text
http://127.0.0.1:8766/admin?tab=finance
```

Verify:

- finance tab is visible for admin/manager roles that can see finance pages
- all three internal views load
- search does not resize or shift tables
- edit modal opens for open entries
- locked rows cannot be edited
- report date range reloads
- profit lots drill-down reaches related ledger rows

- [ ] **Step 3: Browser/mobile smoke**

Use desktop and narrow viewport.

Verify:

- no overlapping text
- action buttons stay icon-sized or concise
- table horizontal scrolling is controlled
- modals fit narrow viewport

- [ ] **Step 4: Stop server**

Run:

```powershell
make run-prod-stop
```

- [ ] **Step 5: Final checks**

Run:

```powershell
cd frontend
npm run build
cd ..
uv run pytest server/tests/test_admin_profit_lots_api.py server/tests/test_finance_entries_flow.py -q
uv run lint-imports
```

- [ ] **Step 6: Final commit**

If any verification fixes were needed:

```powershell
git add frontend server
git commit -m "Polish finance admin frontend"
```

---

## Release Notes For Implementer

- Do not mutate production data while verifying.
- Do not add direct profit lot editing unless a backend invariant is designed first.
- Keep `server/src/core/*` untouched.
- Prefer small files under `frontend/src/features/admin/finance/` over adding more state and handlers to `AdminPage.jsx`.
- Existing admin components are large; match their behavior, but keep this module more focused.
- If the backend response shape differs from this plan, adapt the API normalization in `financeApi.js`, not the table components.

## Self-Review

- Scope covers the three requested views: ledger, profit lots, report.
- Search is included in all three views.
- Editing is included for finance entries, which are the safe editable ledger entity.
- Profit lots are represented as a new entity but intentionally read-only because they are derived accounting state.
- Backend gap is explicit: read-only `GET /admin/profit-lots`.
- Verification includes frontend build, backend tests, import boundary, and manual browser smoke.
