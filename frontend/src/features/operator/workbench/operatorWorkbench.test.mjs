import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("./OperatorPage.jsx", import.meta.url),
  "utf8",
);
const areaSource = readFileSync(
  new URL("./CaptchaArea.jsx", import.meta.url),
  "utf8",
);
const sidebarSource = readFileSync(
  new URL("./OperatorSidebar.jsx", import.meta.url),
  "utf8",
);
const operatorCss = readFileSync(
  new URL("../../../styles/04-operator.css", import.meta.url),
  "utf8",
);
const workbenchCss = readFileSync(
  new URL("../../../ui/styles/layout.css", import.meta.url),
  "utf8",
);

test("operator page delegates queue transitions to operator queue helpers", () => {
  assert.match(pageSource, /createOperatorQueueEntry/);
  assert.match(pageSource, /removeOperatorCaptcha/);
  assert.match(pageSource, /applyOperatorProgress/);
  assert.doesNotMatch(pageSource, /function\s+makeQueueEntry/);
});

test("operator captcha input uses the shared click surface and icon primitives", () => {
  assert.match(areaSource, /CaptchaClickSurface/);
  assert.match(areaSource, /CaptchaIconStrip/);
  assert.match(areaSource, /CaptchaProgressDots/);
  assert.match(areaSource, /PuzzleVariantGrid/);
  assert.match(areaSource, /reverse/);
  assert.doesNotMatch(areaSource, /getBoundingClientRect/);
});

test("operator workbench answers puzzle captchas through distribution answers", () => {
  const serviceSource = readFileSync(
    new URL("./api/operatorWorkbenchService.js", import.meta.url),
    "utf8",
  );
  assert.match(
    serviceSource,
    /answerDistribution:\s*\(payload\)\s*=>\s*backend\.operator\.answerDistribution\(payload\)/,
  );
  assert.match(pageSource, /handlePuzzleAnswer/);
  assert.match(pageSource, /operatorWorkbenchService\.answerDistribution/);
  assert.match(pageSource, /variantIndex/);
});

test("operator side panel reuses master strips for operators and scheduled starts", () => {
  assert.match(sidebarSource, /HomeOperatorStrip/);
  assert.match(sidebarSource, /HomeScheduledEventsStrip/);
  assert.match(sidebarSource, /playSoonSound/);
});

test("operator mobile layout keeps captcha in main workbench and collapses side panels", () => {
  assert.match(
    operatorCss,
    /\.operator-workbench-panel\s*\{[\s\S]*height:\s*100vh;/,
  );
  assert.match(operatorCss, /\.op-captcha\s*\{[\s\S]*flex:\s*1;/);
  assert.match(
    operatorCss,
    /\.op-captcha__image-area\s*\{[\s\S]*flex:\s*1 1 auto;/,
  );
  assert.match(
    operatorCss,
    /\.op-captcha__image-area \.captcha-panel__body--variants\s*\{[\s\S]*height:\s*100%;/,
  );
  assert.match(
    operatorCss,
    /\.op-captcha__image-area \.captcha-variants-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    operatorCss,
    /@media \(max-width:\s*980px\)\s*\{[\s\S]*\.op-captcha__image-area \.captcha-variants-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    operatorCss,
    /\.op-captcha__image-area \.captcha-card\s*\{[\s\S]*min-height:\s*145px;/,
  );
  assert.match(
    workbenchCss,
    /\.eopp-workbench__side\s*\{[\s\S]*display:\s*none;/,
  );
  assert.match(
    workbenchCss,
    /\.eopp-workbench__bottom-actions\s*\{[\s\S]*position:\s*sticky;/,
  );
});
