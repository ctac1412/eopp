import assert from "node:assert/strict";
import test from "node:test";

import {
  getCaptchaGridStatus,
  getIdleCaptchaSkeletonMode,
} from "./captchaGridState.js";

test("captcha grid idle state has a visible header status", () => {
  const status = getCaptchaGridStatus({ active: null, unsolvedCount: 0 });

  assert.equal(status.status, "waiting");
  assert.equal(status.title, "Ожидание запросов");
  assert.equal(status.subtitle, "Нет активной капчи");
  assert.deepEqual(status.badges, ["В очереди: 0"]);
});

test("captcha grid active click state exposes captcha meta", () => {
  const status = getCaptchaGridStatus({
    active: { id: "abc", captchaType: 1 },
    unsolvedCount: 2,
  });

  assert.equal(status.status, "active");
  assert.equal(status.title, "Капча abc");
  assert.equal(status.subtitle, "Клик-капча");
  assert.deepEqual(status.badges, ["В очереди: 2"]);
});

test("captcha grid idle placeholder starts with icon click layout", () => {
  assert.equal(getIdleCaptchaSkeletonMode(), "icon-click");
});
