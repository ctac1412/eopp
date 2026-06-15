import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./OperationsDashboardTab.jsx", import.meta.url), "utf8");

test("operations dashboard exposes admin broadcast chat controls", () => {
  assert.match(source, /data-eopp-component="OpsAdminBroadcast"/);
  assert.match(source, /adminRequest\("\/admin\/chat\/broadcast"/);
  assert.match(source, /adminBroadcastMessage/);
});

test("admin broadcast sends a JSON request through the shared client contract", () => {
  assert.match(source, /json:\s*{\s*message:\s*text,/);
  assert.doesNotMatch(source, /body:\s*JSON\.stringify\(\s*{\s*message:\s*text,/);
});
