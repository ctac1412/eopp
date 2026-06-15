import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./OperationsDashboardTab.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../../styles/05-pages.css", import.meta.url), "utf8");

test("operations dashboard exposes admin broadcast chat controls", () => {
  assert.match(source, /data-eopp-component="OpsAdminBroadcast"/);
  assert.match(source, /adminRequest\("\/admin\/chat\/broadcast"/);
  assert.match(source, /adminBroadcastMessage/);
});

test("admin broadcast sends a JSON request through the shared client contract", () => {
  assert.match(source, /json:\s*{\s*message:\s*text,/);
  assert.doesNotMatch(source, /body:\s*JSON\.stringify\(\s*{\s*message:\s*text,/);
});

test("operations dashboard cards protect compact headers from overlap", () => {
  assert.match(source, /ops-master-card__name/);
  assert.match(source, /ops-master-card__id/);
  assert.match(styles, /\.ops-master-card \.ant-card-head-wrapper[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.ops-master-card__name[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(styles, /\.ops-scheduled-summary__stat span[\s\S]*overflow-wrap:\s*anywhere/);
});
