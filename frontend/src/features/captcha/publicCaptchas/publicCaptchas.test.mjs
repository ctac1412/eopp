import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./PublicCaptchasTab.jsx", import.meta.url), "utf8");

test("public captchas table is compact in the side panel", () => {
  assert.match(source, /scroll=\{false\}/);
  assert.doesNotMatch(source, /scroll=\{\{\s*x:/);
  assert.match(source, /tableLayout="fixed"/);
  assert.match(source, /width:\s*36/);
  assert.match(source, /width:\s*72/);
});

test("public captchas replay reports backend errors", () => {
  assert.match(source, /data\.error \|\| `HTTP \$\{res\.status\}`/);
  assert.match(source, /onReplaySent\?\.\(\)/);
});
