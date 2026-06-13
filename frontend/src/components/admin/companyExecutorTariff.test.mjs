import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companiesSource = readFileSync(new URL("./CompaniesTab.jsx", import.meta.url), "utf8");
const payoutModalSource = readFileSync(new URL("./PayoutModal.jsx", import.meta.url), "utf8");
const payoutsSource = readFileSync(new URL("./PayoutsTab.jsx", import.meta.url), "utf8");

test("company tariff exposes executor amount", () => {
  assert.match(companiesSource, /executor_amount/);
  assert.match(companiesSource, /Executor/);
});

test("payout views expose executor payments", () => {
  assert.match(payoutModalSource, /executor_amount/);
  assert.match(payoutsSource, /total_executor_amount/);
  assert.match(payoutsSource, /Исполнители/);
});
