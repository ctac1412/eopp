import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./useCaptchaStore.js", import.meta.url), "utf8");

test("home log timestamps include milliseconds", () => {
  assert.match(source, /function formatLogTime/);
  assert.match(source, /getMilliseconds\(\)/);
  assert.match(source, /\$\{pad\(date\.getSeconds\(\)\)\}\.\$\{pad\(date\.getMilliseconds\(\), 3\)\}/);
  assert.doesNotMatch(source, /time:\s*new Date\(\)\.toLocaleTimeString\(\)/);
});
