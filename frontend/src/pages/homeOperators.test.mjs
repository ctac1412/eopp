import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeOperatorTags } from "./homeOperators.js";

test("home operator tags prefer login nickname then id", () => {
  const tags = buildHomeOperatorTags([
    { id: 1, login: "anna", nickname: "op-a", online: true },
    { id: 2, nickname: "boris", online: false },
    { id: 3, online: true },
  ]);

  assert.deepEqual(tags.map((tag) => tag.label), ["anna", "boris", "#3"]);
  assert.deepEqual(tags.map((tag) => tag.online), [true, false, true]);
});

test("home operator tags keep assigned icon hints", () => {
  const tags = buildHomeOperatorTags([
    { id: 7, nickname: "vera", assigned_icons: [1, 4] },
  ]);

  assert.deepEqual(tags[0].assignedIcons, [1, 4]);
});
