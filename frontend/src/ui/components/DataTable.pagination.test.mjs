import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataTable = readFileSync(new URL("./DataTable.jsx", import.meta.url), "utf8");

test("DataTable provides the shared pagination defaults", () => {
  assert.match(dataTable, /DATA_TABLE_DEFAULT_PAGE_SIZE = 25/);
  assert.match(dataTable, /DATA_TABLE_PAGE_SIZE_OPTIONS = \[10, 25, 50, 100\]/);
  assert.match(dataTable, /showSizeChanger: true/);
  assert.match(dataTable, /pageSizeOptions: DATA_TABLE_PAGE_SIZE_OPTIONS/);
  assert.match(dataTable, /showTotal: dataTableShowTotal/);
  assert.match(dataTable, /position: paginationConfig\.position \|\| \["topRight", "bottomRight"\]/);
  assert.match(dataTable, /pagination\s*\?\s*\{/);
  assert.match(dataTable, /:\s*false/);
});

test("DataTable total counter uses the same range text everywhere", () => {
  assert.match(dataTable, /function dataTableShowTotal\(total, range\)/);
  assert.match(dataTable, /`\$\{range\[0\]\}-\$\{range\[1\]\} из \$\{total\}`/);
});
