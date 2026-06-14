import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const gridSource = readFileSync(new URL("./CaptchaGrid.jsx", import.meta.url), "utf8");
const iconSource = readFileSync(new URL("./IconClickCaptcha.jsx", import.meta.url), "utf8");
const headerUrl = new URL("./CaptchaPanelHeader.jsx", import.meta.url);
const headerSource = existsSync(headerUrl) ? readFileSync(headerUrl, "utf8") : "";

test("captcha grid and icon click use the same panel header component", () => {
  assert.match(gridSource, /import \{ CaptchaPanelHeader \} from "\.\/CaptchaPanelHeader"/);
  assert.match(iconSource, /import \{ CaptchaPanelHeader \} from "\.\/CaptchaPanelHeader"/);
  assert.doesNotMatch(gridSource, /function CaptchaGridHeader/);
  assert.doesNotMatch(iconSource, /function Header/);
});

test("captcha panel header keeps only compact work metadata", () => {
  assert.match(headerSource, /captcha-panel__header/);
  assert.match(headerSource, /typeLabel/);
  assert.match(headerSource, /statusLabel/);
  assert.match(headerSource, /Clock/);
  assert.doesNotMatch(headerSource, /roleLabel/);
  assert.doesNotMatch(headerSource, /ownerLabel/);
  assert.doesNotMatch(headerSource, /canReset/);
});

test("icon click header omits non-essential work labels", () => {
  assert.doesNotMatch(iconSource, /typeLabel="Клик-капча"/);
  assert.doesNotMatch(iconSource, /roleLabel=/);
  assert.doesNotMatch(iconSource, /ownerLabel=/);
  assert.doesNotMatch(iconSource, /canReset=/);
});
