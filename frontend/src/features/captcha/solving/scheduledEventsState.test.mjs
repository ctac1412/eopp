import assert from "node:assert/strict";
import test from "node:test";

import {
  formatScheduledCountdown,
  getFutureScheduledEvents,
  getNextScheduledEvent,
  upsertScheduledEvent,
} from "./scheduledEventsState.js";

test("scheduled events keep only future starts sorted by time", () => {
  const now = new Date("2026-06-13T10:00:00Z").getTime();
  const events = [
    { label: "late", scheduled_at: "2026-06-13T10:05:00Z" },
    { label: "past", scheduled_at: "2026-06-13T09:59:00Z" },
    { label: "soon", scheduled_at: "2026-06-13T10:01:00Z" },
  ];

  assert.deepEqual(getFutureScheduledEvents(events, now).map((event) => event.label), [
    "soon",
    "late",
  ]);
  assert.equal(getNextScheduledEvent(events, now).label, "soon");
});

test("scheduled countdown formats short and long waits", () => {
  assert.equal(formatScheduledCountdown(65000), "00:01:05");
  assert.equal(formatScheduledCountdown(25 * 3600000), "1д 01:00");
});

test("scheduled event upsert replaces previous plan for the same api key and label", () => {
  const current = [
    {
      api_key_id: 10,
      label: "Бронь abcdef12",
      scheduled_at: "2026-06-13T10:00:00",
    },
    {
      api_key_id: 10,
      label: "Бронь other",
      scheduled_at: "2026-06-13T10:05:00",
    },
  ];

  const next = upsertScheduledEvent(current, {
    api_key_id: 10,
    label: "Бронь abcdef12",
    scheduled_at: "2026-06-13T10:10:00",
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].scheduled_at, "2026-06-13T10:05:00");
  assert.equal(next[1].scheduled_at, "2026-06-13T10:10:00");
});
