import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_TABS,
  resolveAdminTabRoute,
} from "./tabs.js";

const adminPageSource = readFileSync(new URL("../AdminPage.jsx", import.meta.url), "utf8");
const reportsTabSource = readFileSync(new URL("../reports/ReportsTab.jsx", import.meta.url), "utf8");
const metricsTabSource = readFileSync(new URL("../metrics/MetricsTab.jsx", import.meta.url), "utf8");
const backendLogsTabSource = readFileSync(new URL("../system/BackendLogsTab.jsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../../captcha/solving/HomePage.jsx", import.meta.url), "utf8");
const operatorPageSource = readFileSync(new URL("../../operator/workbench/OperatorPage.jsx", import.meta.url), "utf8");
const operatorHeaderSource = readFileSync(new URL("../../operator/workbench/OperatorHeader.jsx", import.meta.url), "utf8");
const indexHtmlSource = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");

test("operations dashboard is the first admin page and default route", () => {
  assert.equal(ADMIN_TABS[0].id, "operations");
  assert.equal(ADMIN_TABS[0].path, "operations");
  assert.match(adminPageSource, /<Navigate to=\{fallbackPath\} replace \/>/);
});

test("admin tabs expose route metadata", () => {
  for (const tab of ADMIN_TABS) {
    assert.equal(typeof tab.id, "string");
    assert.equal(typeof tab.path, "string");
    assert.equal(typeof tab.label, "string");
    assert.equal(typeof tab.component, "function");
  }
});

test("admin exposes a metrics page backed by shared UI components", () => {
  const metricsTab = ADMIN_TABS.find((tab) => tab.id === "metrics");
  assert.equal(metricsTab?.path, "metrics");
  assert.match(metricsTabSource, /MetricsStrip/);
  assert.match(metricsTabSource, /DataTable/);
  assert.match(metricsTabSource, /\/admin\/dashboard/);
});

test("metrics tab is placed before technical status", () => {
  const tabIds = ADMIN_TABS.map((tab) => tab.id);
  assert.ok(tabIds.indexOf("metrics") < tabIds.indexOf("backend-logs"));
});

test("disabled plugin channel flow is not exposed as an admin tab", () => {
  assert.equal(ADMIN_TABS.some((tab) => tab.id === "channels"), false);
});

test("admin shell no longer supports legacy tab query routing", () => {
  assert.doesNotMatch(adminPageSource, /buildLegacyAdminTabRedirect/);
  assert.doesNotMatch(adminPageSource, /location\.search\.includes\("tab="/);
});

test("reports tab does not write legacy tab query param", () => {
  assert.doesNotMatch(reportsTabSource, /nextParams\.set\("tab"/);
});

test("reports usage log request is bounded", () => {
  assert.match(reportsTabSource, /REPORTS_USAGE_LOG_LIMIT\s*=\s*500/);
  assert.match(reportsTabSource, /limit:\s*String\(REPORTS_USAGE_LOG_LIMIT\)/);
  assert.match(reportsTabSource, /offset:\s*"0"/);
});

test("reports finance entry request is bounded", () => {
  assert.match(reportsTabSource, /REPORTS_FINANCE_ENTRIES_LIMIT\s*=\s*500/);
  assert.match(reportsTabSource, /limit:\s*String\(REPORTS_FINANCE_ENTRIES_LIMIT\)/);
});

test("reports expose invoice summary and clickable company badges", () => {
  assert.match(reportsTabSource, /reports-journal-summary/);
  assert.match(reportsTabSource, /ReportsCompanyBadges/);
  assert.match(reportsTabSource, /setCompanyFilter\(company\.name\)/);
  assert.match(reportsTabSource, /selectedInvoiceAmount/);
  assert.doesNotMatch(reportsTabSource, /reports-company-badge__count/);
});

test("home and operator pages expose theme switches", () => {
  assert.match(homePageSource, /HomeThemeSwitch/);
  assert.match(operatorPageSource, /OperatorConnectThemeSwitch/);
  assert.match(operatorHeaderSource, /OperatorThemeSwitch/);
});

test("runtime state renders SSE queues as structured details", () => {
  assert.match(backendLogsTabSource, /entityName === "sse_queues"/);
  assert.match(backendLogsTabSource, /queue_details/);
  assert.match(backendLogsTabSource, /waiting_getters/);
});

test("frontend exposes PWA manifest metadata", () => {
  assert.match(indexHtmlSource, /rel="manifest"/);
  assert.match(indexHtmlSource, /manifest\.webmanifest/);
});

test("admin tab nav uses React Router links instead of document hrefs", () => {
  assert.match(adminPageSource, /<Link[\s\S]*to=\{adminTabPath\(tab\)\}/);
  assert.doesNotMatch(adminPageSource, /href=\{adminTabPath\(tab\)\}/);
});

test("unknown route tab redirects to the first visible tab", () => {
  assert.deepEqual(
    resolveAdminTabRoute({
      tabId: "not-a-tab",
      visibleTabs: ADMIN_TABS.slice(0, 2),
    }),
    { tab: ADMIN_TABS[0], redirectPath: "/admin/operations" },
  );
});

test("unavailable route tab redirects to the first allowed tab", () => {
  const visibleTabs = ADMIN_TABS.filter((tab) => tab.id === "operations");
  assert.deepEqual(
    resolveAdminTabRoute({
      tabId: "users",
      visibleTabs,
      search: "?invite=1",
    }),
    { tab: visibleTabs[0], redirectPath: "/admin/operations?invite=1" },
  );
});
