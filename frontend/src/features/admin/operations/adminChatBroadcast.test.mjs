import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./OperationsDashboardTab.jsx", import.meta.url), "utf8");

test("operations dashboard exposes admin broadcast chat controls", () => {
  assert.match(source, /data-eopp-component="OpsAdminBroadcast"/);
  assert.match(source, /adminRequest\("\/admin\/chat\/broadcast"/);
  assert.match(source, /adminBroadcastMessage/);
});
