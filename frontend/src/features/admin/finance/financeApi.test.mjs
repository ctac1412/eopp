import assert from "node:assert/strict";

import { buildAdminUrl } from "./financeApi.js";

assert.equal(
  buildAdminUrl("/admin/finance-entries", {
    limit: 500,
    offset: 0,
    company_id: 3,
    kind: "manual_adjustment",
    payout_id: "",
    invoice_id: null,
    edit_state: undefined,
  }),
  "/admin/finance-entries?limit=500&offset=0&company_id=3&kind=manual_adjustment",
);

assert.equal(buildAdminUrl("/admin/profit-lots", {}), "/admin/profit-lots");
