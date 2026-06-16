import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const mainSource = readFileSync(new URL("../../../main.jsx", import.meta.url), "utf8");
const authWizardSource = readFileSync(new URL("../../auth/AuthWizard.jsx", import.meta.url), "utf8");

test("operator route is wrapped in the normal cookie login flow", () => {
  assert.match(mainSource, /function OperatorAuthGate\(\)/);
  assert.match(mainSource, /authService\.me\(\)/);
  assert.match(mainSource, /<AuthWizard onSuccess=\{handleAuthSuccess\} requireApiKey=\{false\} \/>/);
  assert.match(mainSource, /<Route path="\/operators\/:uuid" element=\{<OperatorAuthGate \/>} \/>/);
});

test("auth wizard can notify route guards after a successful login", () => {
  assert.match(authWizardSource, /function AuthWizard\(\{ onSuccess, requireApiKey = true \} = \{\}\)/);
  assert.match(authWizardSource, /if \(!requireApiKey\) \{/);
  assert.match(authWizardSource, /onSuccess\?\.\(loginData\);/);
});
