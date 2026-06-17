import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import test from "node:test";

const files = [
  "src/features/auth/api/authService.js",
  "src/features/training/api/trainingService.js",
  "src/features/captcha/solving/api/captchaService.js",
  "src/features/captcha/publicCaptchas/api/publicCaptchasService.js",
  "src/features/captcha/history/api/historyService.js",
  "src/features/operator/workbench/api/operatorWorkbenchService.js",
  "src/features/admin/api/adminService.js",
  "src/features/admin/shared/adminClient.js",
  "src/hooks/useSSE.js",
  "src/features/admin/system/StreamsTab.jsx",
  "src/features/operator/workbench/OperatorPage.jsx",
];

function readSource(file) {
  return readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
}

test("feature API services use the shared backend registry instead of low-level clients", () => {
  const offenders = files
    .filter((file) => file.includes("/api/") || file.endsWith("adminClient.js"))
    .filter((file) => /shared\/api\/(?:httpClient|endpoints)/.test(readSource(file)));

  assert.deepEqual(
    offenders.map((file) => relative("src", file)),
    [],
  );
});

test("SSE consumers build backend URLs through the shared backend registry", () => {
  const offenders = files
    .filter((file) => !file.includes("/api/") && !file.endsWith("adminClient.js"))
    .filter((file) => {
      const source = readSource(file);
      return /shared\/api\/endpoints|API_BASE_URL|["'`]\/api\/|["'`]\/stream/.test(source);
    });

  assert.deepEqual(
    offenders.map((file) => relative("src", file)),
    [],
  );
});
