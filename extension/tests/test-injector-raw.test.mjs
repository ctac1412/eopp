import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/index.tsx"), "utf8");
const types = readFileSync(resolve(root, "src/types.ts"), "utf8");

test("localhost test injector fills company on reservation raw like production", () => {
  assert.match(types, /userData\?:\s*{/);
  assert.match(source, /userData:\s*{/);
  assert.match(source, /organizationName:\s*testCompanyName\(\)/);
});
