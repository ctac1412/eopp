import assert from "node:assert/strict";
import test from "node:test";

import { getPuzzleVariantOrder } from "./puzzleVariantOrder.js";

test("puzzle variant order keeps master top-ranked variants first", () => {
  assert.deepEqual(
    getPuzzleVariantOrder({
      variants: [["0"], ["1"], ["2"], ["3"]],
      top3: ["2", "0"],
    }),
    [2, 0, 1, 3],
  );
});

test("puzzle variant order reverses non-ranked variants while keeping solver top-ranked variants first", () => {
  assert.deepEqual(
    getPuzzleVariantOrder({
      variants: [["0"], ["1"], ["2"], ["3"], ["4"]],
      top3: ["1", "3"],
      reverse: true,
    }),
    [1, 3, 4, 2, 0],
  );
});
