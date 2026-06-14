import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeScheduledEventTags } from "./homeScheduledEvents.js";

test("home scheduled event tags list future starts sorted by time", () => {
  const now = new Date("2026-06-13T10:00:00Z").getTime();
  const tags = buildHomeScheduledEventTags([
    { label: "late", scheduled_at: "2026-06-13T10:10:00Z" },
    { label: "past", scheduled_at: "2026-06-13T09:59:00Z" },
    { label: "soon", scheduled_at: "2026-06-13T10:01:05Z" },
  ], now);

  assert.deepEqual(tags.map((tag) => tag.label), ["soon", "late"]);
  assert.deepEqual(tags.map((tag) => tag.time), ["00:01:05", "00:10:00"]);
});

test("home scheduled event tags mark urgent and soon starts", () => {
  const now = new Date("2026-06-13T10:00:00Z").getTime();
  const tags = buildHomeScheduledEventTags([
    { label: "urgent", scheduled_at: "2026-06-13T10:00:30Z" },
    { label: "soon", scheduled_at: "2026-06-13T10:03:00Z" },
  ], now);

  assert.equal(tags[0].urgent, true);
  assert.equal(tags[1].soon, true);
});
