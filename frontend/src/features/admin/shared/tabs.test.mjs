import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_TABS,
  buildLegacyAdminTabRedirect,
  resolveAdminTabRoute,
} from "./tabs.js";

const adminPageSource = readFileSync(new URL("../AdminPage.jsx", import.meta.url), "utf8");
const reportsTabSource = readFileSync(new URL("../reports/ReportsTab.jsx", import.meta.url), "utf8");

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

test("legacy query tab redirects to route path and preserves other params", () => {
  assert.equal(
    buildLegacyAdminTabRedirect("?tab=invoices&invoice_id=123"),
    "/admin/invoices?invoice_id=123",
  );
});

test("reports tab does not write legacy tab query param", () => {
  assert.doesNotMatch(reportsTabSource, /nextParams\.set\("tab"/);
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
