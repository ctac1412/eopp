import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoicesSource = readFileSync(new URL("./InvoicesTab.jsx", import.meta.url), "utf8");

test("invoices tab exposes side payout and profit fields", () => {
  assert.match(invoicesSource, /side_payout_amount/);
  assert.match(invoicesSource, /profit_amount/);
  assert.match(invoicesSource, /Опер\.\/исп\./);
});
