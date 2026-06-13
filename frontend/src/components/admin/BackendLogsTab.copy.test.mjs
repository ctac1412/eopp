import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("./BackendLogsTab.jsx", import.meta.url);

test("backend logs tab describes outbox as an event journal, not runnable jobs", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /label: "Outbox события"/);
  assert.doesNotMatch(source, /Outbox жд[её]т/);
  assert.match(source, /OUTBOX_STATUS_LABEL/);
  assert.match(source, /pending: "В журнале"/);
  assert.match(source, /Outbox хранит события очереди jobs/);
  assert.match(source, /Кнопка запускает только due background jobs/);
});
