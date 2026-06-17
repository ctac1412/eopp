import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runPageSource = readFileSync(new URL("./runs/TrainingRunPage.jsx", import.meta.url), "utf8");
const reviewPageSource = readFileSync(new URL("./review/TrainingReviewPage.jsx", import.meta.url), "utf8");

test("training puzzle views render variants from raw tiles", () => {
  assert.match(runPageSource, /PuzzleVariantTiles/);
  assert.match(reviewPageSource, /PuzzleVariantTiles/);
  assert.match(runPageSource, /current\.variants\.map/);
  assert.match(reviewPageSource, /captchaData\.variants\.map/);
  assert.doesNotMatch(runPageSource, /Object\.keys\(current\.images\)/);
  assert.doesNotMatch(reviewPageSource, /Object\.keys\(captchaData\.images\)/);
});
