import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entriesView = readFileSync(new URL("./FinanceEntriesView.jsx", import.meta.url), "utf8");
const filters = readFileSync(new URL("./FinanceFilters.jsx", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("../../../ui/styles/layout.css", import.meta.url), "utf8");

test("finance ledger pagination uses the shared admin page sizes", () => {
  assert.match(entriesView, /pagination\s*$/m);
  assert.doesNotMatch(entriesView, /LEDGER_PAGE_SIZE_OPTIONS/);
  assert.doesNotMatch(entriesView, /pageSizeOptions:/);
});

test("finance filters use scoped layout classes instead of inline widths", () => {
  assert.doesNotMatch(filters, /style=\{\{ width:/);
  assert.match(filters, /className="form-label small mb-0 finance-filters__search"/);
  assert.match(filters, /className="form-label small mb-0 finance-filters__company"/);
  assert.match(filters, /className="form-label small mb-0 finance-filters__id"/);
  assert.match(layoutCss, /\.eopp-filter-bar\.finance-filters \.eopp-filter-bar__fields/);
  assert.match(layoutCss, /\.finance-filters__id/);
});
