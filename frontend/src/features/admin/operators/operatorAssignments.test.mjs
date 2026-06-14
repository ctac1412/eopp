import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssignmentDraft,
  buildBulkAssignments,
  toggleMasterAssignment,
} from "./operatorAssignments.js";

test("operator assignment draft normalizes operator company and master scopes", () => {
  const draft = buildAssignmentDraft([
    {
      id: 7,
      company_ids: [1, "2"],
      allowed_master_keys: ["10", 11],
    },
  ]);

  assert.deepEqual(draft, {
    7: {
      companyIds: ["1", "2"],
      masterKeyIds: [10, 11],
    },
  });
});

test("selecting a master key adds its company to operator scope", () => {
  const current = { companyIds: ["1"], masterKeyIds: [10] };
  const next = toggleMasterAssignment(current, {
    masterKeyId: 20,
    checked: true,
    key: { id: 20, company_id: 2 },
  });

  assert.deepEqual(next.companyIds, ["1", "2"]);
  assert.deepEqual(next.masterKeyIds, [10, 20]);
});

test("bulk payload keeps every operator and emits numeric company/key ids", () => {
  const payload = buildBulkAssignments(
    [{ id: 7 }, { id: 8 }],
    {
      7: { companyIds: ["1", "2"], masterKeyIds: ["10", 20] },
      8: { companyIds: [], masterKeyIds: [] },
    },
  );

  assert.deepEqual(payload, [
    { operator_id: 7, company_ids: [1, 2], master_key_ids: [10, 20] },
    { operator_id: 8, company_ids: [], master_key_ids: [] },
  ]);
});
