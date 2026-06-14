import test from "node:test";
import assert from "node:assert/strict";

import {
  accessPayloadFromForm,
  emptyAccess,
  isAccessCompanySelected,
  removeAccessCompany,
  toggleAccessCompany,
  toggleAccessAll,
  upsertAccessCompany,
} from "./userCompanyAccess.js";

test("user company access helper adds, removes, and serializes company tags", () => {
  const initial = emptyAccess();
  const withAlpha = upsertAccessCompany(initial, 10);
  const withBeta = upsertAccessCompany(withAlpha, "20");
  const duplicate = upsertAccessCompany(withBeta, 10);

  assert.deepEqual(duplicate, { allCompanies: false, companyIds: ["10", "20"] });

  const withoutAlpha = removeAccessCompany(duplicate, "10");
  assert.deepEqual(withoutAlpha, { allCompanies: false, companyIds: ["20"] });

  assert.deepEqual(accessPayloadFromForm(withoutAlpha), {
    all_companies: false,
    company_ids: [20],
  });
});

test("global all-company tag clears specific companies and serializes as all", () => {
  const withCompany = upsertAccessCompany(emptyAccess(), 42);
  const all = toggleAccessAll(withCompany, true);

  assert.deepEqual(all, { allCompanies: true, companyIds: [] });
  assert.deepEqual(accessPayloadFromForm(all), {
    all_companies: true,
    company_ids: [],
  });
});

test("company tags expose selected state and toggle by click", () => {
  const initial = upsertAccessCompany(emptyAccess(), 7);

  assert.equal(isAccessCompanySelected(initial, 7), true);
  assert.equal(isAccessCompanySelected(initial, 8), false);

  const removed = toggleAccessCompany(initial, 7);
  assert.deepEqual(removed, { allCompanies: false, companyIds: [] });

  const added = toggleAccessCompany(removed, 8);
  assert.deepEqual(added, { allCompanies: false, companyIds: ["8"] });
});
