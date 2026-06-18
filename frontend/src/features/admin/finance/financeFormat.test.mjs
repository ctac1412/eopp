import assert from "node:assert/strict";
import test from "node:test";

import { formatMoney, matchesFinanceSearch } from "./financeFormat.js";

test("finance format helpers render money and match searchable fields", () => {
assert.match(formatMoney(1200), /1\s?200.*₽/u);
assert.equal(formatMoney(null), "—");

const row = {
  id: 7,
  kind: "manual_adjustment",
  comment: "ручная правка баланса",
  invoice_number: "INV-20260614",
  company_name: "Finance Co",
};

assert.equal(matchesFinanceSearch(row, "правка"), true);
assert.equal(matchesFinanceSearch(row, "INV-20260614"), true);
assert.equal(matchesFinanceSearch(row, "корректировка"), true);
assert.equal(matchesFinanceSearch(row, ""), true);
assert.equal(matchesFinanceSearch(row, "нет совпадений"), false);
});
