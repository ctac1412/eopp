import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companiesSource = readFileSync(new URL("./CompaniesTab.jsx", import.meta.url), "utf8");
const payoutModalSource = readFileSync(new URL("../payouts/PayoutModal.jsx", import.meta.url), "utf8");
const payoutsSource = readFileSync(new URL("../payouts/PayoutsTab.jsx", import.meta.url), "utf8");

test("company tariff exposes company-level operator and executor amounts", () => {
  assert.match(companiesSource, /executor_amount/);
  assert.match(companiesSource, /operator_amount/);
  assert.match(companiesSource, /Исполнитель/);
  assert.match(companiesSource, /Оператор/);
  assert.match(companiesSource, /company\.tariff/);
});

test("companies tab exposes editable default tariff and apply-default action", () => {
  assert.match(companiesSource, /default-company-tariff/);
  assert.match(companiesSource, /apply-default/);
  assert.match(companiesSource, /Дефолтный тариф/);
  assert.match(companiesSource, /Применить дефолт/);
  assert.match(companiesSource, /defaultTariffForm/);
});

test("payout views expose executor payments", () => {
  assert.match(payoutModalSource, /executor_amount/);
  assert.match(payoutsSource, /total_executor_amount/);
  assert.match(payoutsSource, /Исполнители/);
});
