import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payoutsTab = readFileSync(new URL("./PayoutsTab.jsx", import.meta.url), "utf8");

test("payouts table uses shared admin pagination sizes", () => {
  assert.match(payoutsTab, /pagination\s*$/m);
  assert.doesNotMatch(payoutsTab, /PAYOUTS_PAGE_SIZE_OPTIONS/);
  assert.doesNotMatch(payoutsTab, /pageSize: 15/);
  assert.doesNotMatch(payoutsTab, /pageSizeOptions: \[10, 15, 30, 50\]/);
});
