import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CaptchasTab.jsx", import.meta.url), "utf8");

test("admin captchas requests are bounded", () => {
  assert.match(source, /ADMIN_CAPTCHAS_LIMIT\s*=\s*500/);
  assert.match(source, /ADMIN_CAPTCHA_FILES_LIMIT\s*=\s*500/);
  assert.match(source, /\/admin\/captchas\?\$\{params\.toString\(\)\}/);
  assert.match(source, /\/admin\/captcha-files\?\$\{params\.toString\(\)\}/);
  assert.match(source, /offset:\s*"0"/);
});

test("captcha thumbnail image urls use the API prefix", () => {
  assert.match(source, /captchaThumbnailUrl/);
  assert.match(source, /backend\.url\([\s\S]*`\/admin\/captcha-files\/\$\{encodeURIComponent\(captchaId\)\}\/thumbnail`/);
  assert.doesNotMatch(source, /src=\{`\/admin\/captcha-files\//);
});
