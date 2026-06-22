import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CaptchasTab.jsx", import.meta.url), "utf8");
const pagesCss = readFileSync(new URL("../../../styles/05-pages.css", import.meta.url), "utf8");

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

test("captcha previews fall back to the first tile assembly when no answer exists", () => {
  assert.match(source, /function hasPreviewSource\(captcha\)/);
  assert.match(source, /return Boolean\(captcha\?\.captcha_id\)/);
  assert.match(source, /function captchaPreviewMode\(captcha\)/);
  assert.match(source, /return "first"/);
  assert.match(source, /const mode = validIndex != null \? null : hasSolverRank \? "solver_top1" : "first"/);
  assert.match(source, /hasPreviewSource\(captcha\) \? \(/);
  assert.doesNotMatch(source, /valid_index != null \|\| captcha\.solver_valid_rank == null/);
});

test("labeling modal can render raw tile variants when image previews are absent", () => {
  assert.match(source, /PuzzleVariantTiles/);
  assert.match(source, /const variantIndexes = Array\.isArray\(labelingCaptcha\.variants\)/);
  assert.match(source, /className="captchas-label-variant__tiles"/);
  assert.match(source, /captchas-label-empty/);
  assert.match(pagesCss, /\.captchas-label-variant__tile\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.doesNotMatch(pagesCss, /\.captchas-label-variant__tile\s*\{[\s\S]*aspect-ratio:\s*1 \/ 1;[\s\S]*\}/);
});
