import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync(new URL("./CaptchaGrid.jsx", import.meta.url), "utf8");
const componentCss = readFileSync(new URL("../../../styles/03-components.css", import.meta.url), "utf8");

test("idle captcha body leaves status text to the grid header", () => {
  assert.doesNotMatch(gridSource, /IdleBody\(\{\s*solvedCount\s*\}\)/);
  assert.doesNotMatch(gridSource, /const\s+solved\s*=\s*queue/);
  assert.doesNotMatch(gridSource, /idle-state text-center/);
});

test("icon click captcha uses an effective fixed image field", () => {
  assert.match(componentCss, /--captcha-click-image-width:\s*530px/);
  assert.match(componentCss, /--captcha-click-image-height:\s*300px/);
  assert.match(componentCss, /\.captcha-click-area\s*\{/);
  assert.match(componentCss, /\.captcha-click-area__image\s*\{/);
});

test("puzzle variants render as a bounded thumbnail grid", () => {
  assert.match(gridSource, /captcha-panel__body--variants/);
  assert.match(componentCss, /\.captcha-panel__body--variants\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(componentCss, /\.captcha-variants-grid\s*\{[\s\S]*height:\s*100%;/);
  assert.match(componentCss, /grid-auto-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(componentCss, /\.captcha-card\s*\{[\s\S]*display:\s*flex;/);
  assert.match(componentCss, /\.captcha-card__img\s*\{[\s\S]*min-height:\s*0;/);
});

test("idle captcha placeholder can show the next scheduled start countdown", () => {
  assert.match(gridSource, /IdleScheduledCountdown/);
  assert.match(gridSource, /getNextScheduledEvent/);
  assert.match(gridSource, /formatScheduledCountdown/);
  assert.match(componentCss, /\.captcha-idle-schedule\s*\{/);
  assert.match(componentCss, /\.captcha-idle-schedule__time\s*\{/);
});
