import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const mainSource = readFileSync(new URL("../../../main.jsx", import.meta.url), "utf8");
const authWizardSource = readFileSync(new URL("../../auth/AuthWizard.jsx", import.meta.url), "utf8");
const operatorHeaderSource = readFileSync(new URL("./OperatorHeader.jsx", import.meta.url), "utf8");

test("operator route opens the distributed operator page directly", () => {
  assert.doesNotMatch(mainSource, /function OperatorAuthGate/);
  assert.doesNotMatch(mainSource, /requireApiKey=\{false\}/);
  assert.doesNotMatch(mainSource, /authService\.me\(\)/);
  assert.match(mainSource, /<Route[\s\S]*path="\/operators\/:uuid"[\s\S]*<OperatorPage[\s\S]*themeMode=\{themeMode\}[\s\S]*onThemeModeChange=\{setThemeMode\}/);
});

test("auth wizard can notify route guards after a successful login", () => {
  assert.match(authWizardSource, /function AuthWizard\(\{ onSuccess, requireApiKey = true \} = \{\}\)/);
  assert.match(authWizardSource, /if \(!requireApiKey\) \{/);
  assert.match(authWizardSource, /onSuccess\?\.\(loginData\);/);
});

test("operator header does not expose a disconnect button", () => {
  assert.doesNotMatch(operatorHeaderSource, /OperatorDisconnectButton/);
  assert.doesNotMatch(operatorHeaderSource, /handleDisconnect/);
});
