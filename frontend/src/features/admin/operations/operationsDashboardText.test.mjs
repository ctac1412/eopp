import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./OperationsDashboardTab.jsx", import.meta.url), "utf8");

const cp1251Tail =
  "[\\u0402\\u0403\\u201A\\u0453\\u201E\\u2026\\u2020\\u2021\\u20AC\\u2030" +
  "\\u0409\\u2039\\u040A\\u040C\\u040B\\u040F\\u0452\\u2018\\u2019\\u201C" +
  "\\u201D\\u2022\\u2013\\u2014\\u2122\\u0459\\u203A\\u045A\\u045C\\u045B" +
  "\\u045F\\u00A0\\u040E\\u045E\\u0408\\u00A4\\u0490\\u00A6\\u00A7\\u0401" +
  "\\u00A9\\u0404\\u00AB\\u00AC\\u00AD\\u00AE\\u0407\\u00B0\\u00B1\\u0406" +
  "\\u0456\\u0491\\u00B5\\u00B6\\u00B7\\u0451\\u2116\\u0454\\u00BB\\u0458" +
  "\\u0405\\u0455\\u0457]";
const suspiciousMojibake = new RegExp(
  `(?:\\u0420${cp1251Tail}|\\u0421${cp1251Tail}|\\u0413\\u2014|\\u0412\\u00B7|\\uFFFD)`,
);

test("operations dashboard keeps readable Russian UI text", () => {
  assert.match(source, /Оперативный дэшборд/);
  assert.match(source, /Быстрое распределение online-операторов между мастерами/);
  assert.doesNotMatch(source, suspiciousMojibake);
});

test("operations dashboard can auto-refresh every five seconds", () => {
  assert.match(source, /autoRefreshEnabled/);
  assert.match(source, /setInterval\(loadAll,\s*5000\)/);
  assert.match(source, /refreshInFlightRef\.current/);
  assert.match(source, /Авто 5с/);
  assert.match(source, /loading=\{refreshing\}/);
  assert.match(source, /Обновляется\.\.\./);
  assert.match(source, /formatRefreshTime\(lastRefreshAt\)/);
});

test("scheduled operations table can recover facility and vehicle from event label", () => {
  assert.match(source, /function scheduledLabelParts\(event\)/);
  assert.match(source, /scheduledLabelParts\(event\)\.vehicle/);
  assert.match(source, /scheduledLabelParts\(event\)\.facility/);
});
