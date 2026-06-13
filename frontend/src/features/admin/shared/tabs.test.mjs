import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ADMIN_TABS } from "./tabs.js";

const adminPageSource = readFileSync(new URL("../../../AdminPage.jsx", import.meta.url), "utf8");

test("operations dashboard is the first admin page and default tab", () => {
  assert.equal(ADMIN_TABS[0].id, "operations");
  assert.match(adminPageSource, /searchParams\.get\("tab"\) \|\| "operations"/);
});
