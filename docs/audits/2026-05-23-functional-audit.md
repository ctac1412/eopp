# Functional Audit (Admin + Plugin)

Date: 2026-05-23
Scope: functional UX and operational completeness (security excluded by request).

## Executive summary

- Core billing workflows now exist in two modes: manual invoice from usage logs and auto-invoice by company.
- Major gap closed: manual invoice flow from unlinked logs restored in Reports.
- Remaining product risk is workflow fragmentation: invoice lifecycle is split across Reports and Invoices tabs with limited cross-navigation and weak status visibility for auto-invoice settings.

## Admin panel findings

### P0 / Blocking for operations

1. No explicit "Auto-invoice settings" surface in Invoices tab
   - Backend setting exists (`auto_invoice_reopen`) but UX is not yet discoverable enough for accountants.
   - Impact: operators cannot reliably understand when next auto-invoice will be reopened.
   - Recommendation: add Invoices sub-panel "Авто-счета по компаниям" with:
     - company selector
     - open/create auto-invoice
     - finalize auto-invoice
     - toggle auto-reopen
     - current active auto-invoice per company

2. Reports and Invoices are not tightly linked
   - After manual generation from Reports, no deep-link jump to created invoice card/row.
   - Impact: reconciliation is slower.
   - Recommendation: return `invoice_id` and open Invoices tab filtered by that id.

### P1 / High value usability

1. Prepaid packages tab has minimal controls (active toggle + create)
   - Missing: explicit top-up action, deduction history view, linked usage drilldown.
   - Recommendation: add:
     - top-up modal (`+ amount`)
     - deductions table (`prepaid_deductions`)
     - quick filters by key/date.

2. Auto-invoice naming in UI
   - "Open invoice" wording can be confused with unpaid invoice.
   - Recommendation: in UI terminology use "Авто-счет" consistently.

3. Company identity is free-text
   - `company` comes from usage payload, no normalization dictionary in backend.
   - Impact: typo variants split billing streams.
   - Recommendation: add company normalization map / aliases editable in admin.

### P2 / Quality improvements

1. Several files still contain mixed encoding artifacts in comments/labels.
2. AdminPage became large and should be split by domain tabs to reduce regression risk.

## Plugin findings

### P0

1. Popup close semantics
   - Fixed: close action now aborts running pipeline before unmount.
   - Fixed: accidental close on overlay click disabled.

### P1

1. User feedback after forced stop could be clearer
   - Recommendation: show explicit "Операция остановлена, лог отправлен".

2. Retry/stop telemetry
   - Recommendation: structured stage-end events for easier support analysis.

## Legacy / likely stale code paths

1. Reports had dormant manual invoice code path (restored).
2. There are duplicated invoice creation paradigms (`generate_invoice` vs `create_invoice`) and both should be intentionally documented:
   - `generate_invoice`: from selected usage logs
   - `create_invoice`: manual with custom line items

## Recommended next increments

1. Build dedicated "Авто-счета" block in Invoices tab with settings + actions.
2. Add prepaid top-up and deductions ledger UI.
3. Add deep links and post-action navigation between Reports/Invoices.
4. Introduce DTOs and SQLAlchemy Core in billing repository paths to stabilize DB contracts.
