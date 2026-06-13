import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHomeSideTab } from "./homeTabs.js";

test("home side tab defaults legacy queue tab to chat", () => {
  assert.equal(normalizeHomeSideTab("captchas"), "chat");
  assert.equal(normalizeHomeSideTab(null), "chat");
  assert.equal(normalizeHomeSideTab("unknown"), "chat");
});

test("home side tab keeps supported side panel tabs", () => {
  assert.equal(normalizeHomeSideTab("chat"), "chat");
  assert.equal(normalizeHomeSideTab("history"), "history");
  assert.equal(normalizeHomeSideTab("public-captchas"), "public-captchas");
});
