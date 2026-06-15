import test from "node:test";
import assert from "node:assert/strict";

import { getCompany, getCompanyFull, getSearchText } from "./reportUtils.js";

test("journal company helpers prefer the canonical company model name over raw aliases", () => {
  const record = {
    company: "Хип-Хоп Транс Дэнс",
    company_name: 'ООО "АРТ-ТРАНС"',
  };

  assert.equal(getCompany(record), 'ООО "АРТ-ТРАНС"');
  assert.equal(getCompanyFull(record), 'ООО "АРТ-ТРАНС"');
  assert.match(getSearchText(record), /хип-хоп транс дэнс/);
  assert.match(getSearchText(record), /арт-транс/);
});
