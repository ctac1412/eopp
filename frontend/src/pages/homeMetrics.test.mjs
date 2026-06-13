import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeMetrics } from "./homeMetrics.js";

test("home metrics only keeps connection queue and operators", () => {
  const metrics = buildHomeMetrics({
    connectedOperators: [{ online: true }, { online: false }],
    queue: [{ solved: false }, { solved: true }],
    sseConnected: true,
  });

  assert.deepEqual(metrics.map((item) => item.key), ["connection", "queue", "operators"]);
  assert.equal(metrics.find((item) => item.key === "operators").value, "1 из 2");
});

test("home metrics describes missing operators without a 0/0 ratio", () => {
  const metrics = buildHomeMetrics({
    connectedOperators: [],
    queue: [],
    sseConnected: false,
  });

  assert.equal(metrics.find((item) => item.key === "operators").value, "нет");
});
