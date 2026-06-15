import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentOperatorPageUrl } from "./homeOperatorAccess.js";

test("operator page url is available only for active operator profiles", () => {
  assert.equal(getCurrentOperatorPageUrl(null), "");
  assert.equal(getCurrentOperatorPageUrl({ active: false, uuid: "op-1" }), "");
  assert.equal(getCurrentOperatorPageUrl({ active: true, uuid: "" }), "");
  assert.equal(getCurrentOperatorPageUrl({ active: true, uuid: "op 1" }), "/operators/op%201");
});
