import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tabSource = readFileSync(new URL("./CaptchaTab.jsx", import.meta.url), "utf8");
const pageCss = readFileSync(new URL("../styles/05-pages.css", import.meta.url), "utf8");
const componentCss = readFileSync(new URL("../styles/03-components.css", import.meta.url), "utf8");

test("captcha tab keeps captcha stage independent from growing logs", () => {
  assert.match(tabSource, /home-queue-stage/);
  assert.doesNotMatch(tabSource, /home-queue-log-slot/);
  assert.doesNotMatch(tabSource, /LogViewer/);
  assert.doesNotMatch(tabSource, /maxHeight:\s*"120px"/);

  assert.match(pageCss, /\.home-workspace\s*\{[\s\S]*grid-template-areas:\s*"queue side"\s*"logs side"/);
  assert.match(pageCss, /\.home-queue-stage\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(pageCss, /\.home-workspace__logs\s*\{[\s\S]*overflow:\s*hidden;/);
});

test("solver logs scroll inside their own fixed slot", () => {
  assert.match(componentCss, /\.solver-log-panel\s*\{[\s\S]*height:\s*100%;/);
  assert.match(componentCss, /\.solver-log-panel__body\s*\{[\s\S]*overflow:\s*auto;/);
});
