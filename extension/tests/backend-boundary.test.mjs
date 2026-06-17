import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

const backendRegistryFiles = new Set([
  "background-api.js",
  "src/api/backend.ts",
]);

const files = [
  "background.js",
  "src/api/background.ts",
  "src/api/client.ts",
  "src/api/stages.ts",
  "src/components/ConfigForm.tsx",
];

function readSource(file) {
  return readFileSync(resolve(root, file), "utf8");
}

test("extension backend endpoints live in the backend registry", () => {
  const offenders = files.filter((file) => {
    if (backendRegistryFiles.has(file)) return false;
    const source = readSource(file);
    return /fetch\([^)]*\/api\/|apiUrl\(|["']\/(?:solve-captcha|confirm-usage|fail-usage|register-usage|api-key-status|slots-group|scheduled-event|mock-config)/.test(
      source,
    );
  });

  assert.deepEqual(
    offenders.map((file) => relative(root, resolve(root, file))),
    [],
  );
});
