import assert from "node:assert/strict";
import test from "node:test";

import { buildOperationsScheduledSummary } from "./operationsScheduledSummary.js";

test("operations scheduled summary groups future starts by master before distribution", () => {
  const now = new Date("2026-06-13T10:00:00Z").getTime();
  const masters = [
    { id: 1, label: "Alpha" },
    { id: 2, label: "Beta" },
  ];

  const summary = buildOperationsScheduledSummary(
    [
      { api_key_id: 1, label: "late", scheduled_at: "2026-06-13T10:12:00Z" },
      { api_key_id: 1, label: "urgent", scheduled_at: "2026-06-13T10:00:30Z" },
      { api_key_id: 2, label: "past", scheduled_at: "2026-06-13T09:59:00Z" },
      { api_key_id: 3, label: "external", scheduled_at: "2026-06-13T10:03:00Z" },
    ],
    masters,
    now,
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.urgent, 1);
  assert.equal(summary.soon, 2);
  assert.deepEqual(summary.byMaster.map((item) => item.masterLabel), ["Alpha", "Master #3"]);
  assert.deepEqual(summary.byMaster[0].events.map((item) => item.label), ["urgent", "late"]);
  assert.equal(summary.byMaster[0].nextCountdown, "00:00:30");
});
