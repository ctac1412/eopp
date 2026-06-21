import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entriesView = readFileSync(new URL("./FinanceEntriesView.jsx", import.meta.url), "utf8");
const filters = readFileSync(new URL("./FinanceFilters.jsx", import.meta.url), "utf8");
const financeTab = readFileSync(new URL("./FinanceTab.jsx", import.meta.url), "utf8");
const analyticsView = readFileSync(new URL("./FinanceAnalyticsView.jsx", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("../../../ui/styles/layout.css", import.meta.url), "utf8");
const pagesCss = readFileSync(new URL("../../../styles/05-pages.css", import.meta.url), "utf8");

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

test("finance tab exposes analytics subtab with charted finance metrics", () => {
  assert.match(financeTab, /value:\s*"analytics"/);
  assert.match(financeTab, /FinanceAnalyticsView/);
  assert.match(analyticsView, /data-eopp-component="FinanceAnalyticsView"/);
  assert.match(analyticsView, /MetricsStrip/);
  assert.match(analyticsView, /finance-analytics-chart--daily/);
  assert.match(analyticsView, /finance-analytics-chart--kinds/);
  assert.match(analyticsView, /finance-analytics-chart--companies/);
  assert.match(pagesCss, /\.finance-analytics-grid/);
  assert.match(pagesCss, /\.finance-chart-bar__fill/);
});
