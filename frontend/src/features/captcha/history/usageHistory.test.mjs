import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(new URL("./api/historyService.js", import.meta.url), "utf8");

test("usage history requests a bounded first page", () => {
  assert.match(serviceSource, /USAGE_LOG_PAGE_LIMIT\s*=\s*100/);
  assert.match(serviceSource, /limit:\s*USAGE_LOG_PAGE_LIMIT/);
  assert.match(serviceSource, /offset:\s*0/);
});
