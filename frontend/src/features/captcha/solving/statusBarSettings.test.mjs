import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statusBar = readFileSync(new URL("./StatusBar.jsx", import.meta.url), "utf8");
const iconClickCaptcha = readFileSync(new URL("./IconClickCaptcha.jsx", import.meta.url), "utf8");

test("test run course select can be selected and cleared inside settings panel", () => {
  const selectBlock = statusBar.match(
    /<SelectInput[\s\S]*data-eopp-component="StatusBarCourseSelect"[\s\S]*?\/>/,
  )?.[0];

  assert.ok(selectBlock, "StatusBarCourseSelect should exist");
  assert.match(selectBlock, /\ballowClear\b/);
  assert.match(selectBlock, /getPopupContainer=\{\(trigger\) => trigger\.parentElement\}/);
  assert.doesNotMatch(selectBlock, /allowClear=\{false\}/);
});

test("test run settings do not expose sequential icon toggle", () => {
  assert.doesNotMatch(statusBar, /click_sequential_icons/);
  assert.doesNotMatch(statusBar, /sequentialIcons/);
});

test("normal icon click captcha always advances icons sequentially", () => {
  assert.doesNotMatch(iconClickCaptcha, /click_sequential_icons/);
  assert.doesNotMatch(iconClickCaptcha, /isSequentialEnabled/);
  assert.match(iconClickCaptcha, /currentPosition=\{markers\.length\}/);
});
