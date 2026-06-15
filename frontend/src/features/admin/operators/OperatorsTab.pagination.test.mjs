import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./OperatorsTab.jsx", import.meta.url), "utf8");

test("operator actions journal renders raw paginated answer rows", () => {
  assert.match(source, /data=\{answers\}/);
  assert.doesNotMatch(source, /data=\{groupedAnswers\}/);
  assert.doesNotMatch(source, /const groupedAnswers = useMemo/);
});
