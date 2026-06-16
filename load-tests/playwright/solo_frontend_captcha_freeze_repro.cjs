#!/usr/bin/env node
"use strict";

const { createRequire } = require("node:module");
const { execFileSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  try {
    const globalNodeModules = execSync("npm root -g", { encoding: "utf8" }).trim();
    const globalRequire = createRequire(path.join(globalNodeModules, "noop.js"));
    ({ chromium } = globalRequire("playwright"));
  } catch {
    console.error("Playwright is required. Install it globally: npm install -g playwright");
    throw error;
  }
}

const rootDir = path.resolve(__dirname, "..", "..");
const baseUrl = (process.env.EOPP_SOLO_FRONTEND_BASE_URL || "http://127.0.0.1:8766").replace(/\/+$/, "");
const authMode = process.env.EOPP_SOLO_FRONTEND_AUTH_MODE || "session";
const apiKeyList = (process.env.EOPP_SOLO_FRONTEND_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const userLoginList = (process.env.EOPP_SOLO_FRONTEND_USER_LOGINS || "")
  .split(",")
  .map((login) => login.trim())
  .filter(Boolean);
const userPasswordList = (process.env.EOPP_SOLO_FRONTEND_USER_PASSWORDS || "")
  .split(",")
  .map((password) => password.trim())
  .filter(Boolean);
const scenario = process.env.EOPP_FRONTEND_LOAD_SCENARIO || "solo";
const distributedMasterLogins = (process.env.EOPP_DISTRIBUTED_MASTER_LOGINS || "")
  .split(",")
  .map((login) => login.trim())
  .filter(Boolean);
const distributedMasterPasswords = (process.env.EOPP_DISTRIBUTED_MASTER_PASSWORDS || "")
  .split(",")
  .map((password) => password.trim())
  .filter(Boolean);
const distributedMasterApiKeys = (process.env.EOPP_DISTRIBUTED_MASTER_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const distributedOperatorLogins = (process.env.EOPP_DISTRIBUTED_OPERATOR_LOGINS || "")
  .split(";")
  .map((group) => group.split(",").map((login) => login.trim()).filter(Boolean))
  .filter((group) => group.length > 0);
const distributedOperatorPasswords = (process.env.EOPP_DISTRIBUTED_OPERATOR_PASSWORDS || "")
  .split(";")
  .map((group) => group.split(",").map((password) => password.trim()).filter(Boolean))
  .filter((group) => group.length > 0);
const distributedOperatorUuids = (process.env.EOPP_DISTRIBUTED_OPERATOR_UUIDS || "")
  .split(";")
  .map((group) => group.split(",").map((uuid) => uuid.trim()).filter(Boolean))
  .filter((group) => group.length > 0);
const ignoreHttpsErrors = process.env.EOPP_SOLO_FRONTEND_IGNORE_HTTPS_ERRORS === "1";
if (ignoreHttpsErrors) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
const adminLogin = process.env.EOPP_SOLO_FRONTEND_ADMIN_LOGIN || process.env.EOPP_TECH_USER_LOGIN || "codex";
const adminPassword =
  process.env.EOPP_SOLO_FRONTEND_ADMIN_PASSWORD ||
  process.env.EOPP_TECH_USER_PASSWORD ||
  "codex-local-admin-2026";
const browserCount = Number(process.env.EOPP_SOLO_FRONTEND_BROWSERS || 4);
const distributedMasterCount = Number(
  process.env.EOPP_DISTRIBUTED_MASTER_COUNT || distributedMasterLogins.length || 1,
);
const distributedOperatorsPerMaster = Number(process.env.EOPP_DISTRIBUTED_OPERATORS_PER_MASTER || 3);
const rounds = Number(process.env.EOPP_SOLO_FRONTEND_ROUNDS || 10);
const captchasPerBrowser = Number(process.env.EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER || 1);
const headless = process.env.EOPP_SOLO_FRONTEND_HEADLESS === "1";
const solveDelayMs = Number(process.env.EOPP_SOLO_FRONTEND_SOLVE_DELAY_MS || 0);
const clickIntervalMs = Number(process.env.EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS || 1000);
const windowLayout = process.env.EOPP_SOLO_FRONTEND_WINDOW_LAYOUT || "grid";
const windowWidth = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_WIDTH || 1280);
const windowHeight = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_HEIGHT || 516);
const windowTotalWidth = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_TOTAL_WIDTH || 0);
const windowStartX = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_START_X || 0);
const windowStartY = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_START_Y || 0);
const windowGap = Number(process.env.EOPP_SOLO_FRONTEND_WINDOW_GAP || 0);
const devtools = process.env.EOPP_SOLO_FRONTEND_DEVTOOLS === "1";
const openFrontendStaggerMs = Number(process.env.EOPP_SOLO_FRONTEND_OPEN_STAGGER_MS || 0);
const openFrontendTimeoutMs = Number(process.env.EOPP_SOLO_FRONTEND_OPEN_TIMEOUT_MS || 20000);
const solveCaptchaTimeoutMs = Number(process.env.EOPP_SOLO_FRONTEND_SOLVE_CAPTCHA_TIMEOUT_MS || 30000);
const imageVisibleTimeoutMs = Number(process.env.EOPP_SOLO_FRONTEND_IMAGE_TIMEOUT_MS || 10000);
const solveResponseTimeoutMs = Number(process.env.EOPP_SOLO_FRONTEND_SOLVE_RESPONSE_TIMEOUT_MS || 10000);
const testNoTimeout = process.env.EOPP_SOLO_FRONTEND_TEST_NO_TIMEOUT === "1";
const runId = process.env.EOPP_SOLO_FRONTEND_RUN_ID || `solo-${Date.now().toString(36)}`;
const artifactsDir = path.join(__dirname, "artifacts");
const workDir = path.resolve(
  process.env.EOPP_SOLO_FRONTEND_WORKDIR ||
    path.join(artifactsDir, "solo-frontend-freeze-repro"),
);
const dbPath = path.resolve(
  process.env.EOPP_SOLO_FRONTEND_CAPTCHA_DB ||
    path.join(rootDir, "server", "data", "api_keys.db"),
);
const captchaDir = path.resolve(
  process.env.EOPP_SOLO_FRONTEND_CAPTCHA_DIR ||
    path.join(rootDir, "server", "data", "captcha_examples", "all"),
);
const identitiesPath = path.join(workDir, "identities.json");
const refreshAuth = process.env.EOPP_SOLO_FRONTEND_REFRESH_AUTH === "1";
const clickCount = Number(process.env.EOPP_SOLO_FRONTEND_ICON_CLICKS || 5);
const captchaPoolOffset = Number(process.env.EOPP_SOLO_FRONTEND_CAPTCHA_POOL_OFFSET || 0);
const holdAfterMs = Number(process.env.EOPP_SOLO_FRONTEND_HOLD_AFTER_MS || 0);
const distributedQueueMode = process.env.EOPP_DISTRIBUTED_QUEUE_MODE || "sequential";
const distributedClickLayouts = {
  2: [3, 2],
  3: [2, 2, 1],
  4: [2, 1, 1, 1],
};

function percentile(values, pct) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil((pct / 100) * ordered.length) - 1));
  return ordered[index];
}

function summarize(values) {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    avg_ms: values.length ? sum / values.length : 0,
    p50_ms: percentile(values, 50),
    p95_ms: percentile(values, 95),
    p99_ms: percentile(values, 99),
    max_ms: values.length ? Math.max(...values) : 0,
  };
}

function randomInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(low + Math.random() * (high - low + 1));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function distributedWindowCount() {
  if (scenario !== "master-operators") return browserCount;
  if (distributedOperatorLogins.length) {
    const operatorCount = distributedOperatorLogins
      .slice(0, distributedMasterCount)
      .reduce((sum, group) => sum + group.length, 0);
    return distributedMasterCount + operatorCount;
  }
  return distributedMasterCount * (1 + distributedOperatorsPerMaster);
}

function windowBoundsForIndex(index) {
  if (headless || windowLayout === "off") return null;
  if (windowLayout !== "grid") return null;

  const windowCount = distributedWindowCount();
  if (scenario === "master-operators") {
    const totalGap = Math.max(0, windowCount - 1) * windowGap;
    const availableWidth = Math.max(windowCount, (windowTotalWidth || windowWidth) - totalGap);
    const participantWidth = Math.floor(availableWidth / Math.max(1, windowCount));
    return {
      x: windowStartX + index * (participantWidth + windowGap),
      y: windowStartY,
      width: participantWidth,
      height: windowHeight,
    };
  }

  const columns = windowCount > 4 ? 4 : Math.min(2, Math.max(1, windowCount));
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: windowStartX + column * (windowWidth + windowGap),
    y: windowStartY + row * (windowHeight + windowGap),
    width: windowWidth,
    height: windowHeight,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function errorDetails(error) {
  const details = {
    message: error?.message || String(error),
  };
  if (error?.name) details.name = error.name;
  if (error?.code) details.code = error.code;
  if (error?.cause) {
    details.cause = {
      message: error.cause.message || String(error.cause),
      name: error.cause.name,
      code: error.cause.code,
    };
  }
  return details;
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(openFrontendTimeoutMs),
    headers: {
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

function cookieHeaderFrom(response) {
  const raw = response.headers.get("set-cookie") || "";
  return raw
    .split(/,(?=\s*[^;=]+=[^;]+)/)
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function parseCookiePair(cookieHeader, name) {
  const pair = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  if (!pair) return null;
  return pair.slice(name.length + 1);
}

async function setupAdminCookie() {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(openFrontendTimeoutMs),
    body: JSON.stringify({ login: adminLogin, password: adminPassword }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`admin login failed ${response.status}: ${text.slice(0, 500)}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error("admin login did not return a session cookie");
  return cookie;
}

async function loginUser(identity) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(openFrontendTimeoutMs),
    body: JSON.stringify({ login: identity.login, password: identity.password }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`user login failed ${response.status}: ${text.slice(0, 500)}`);
  }
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error(`user login did not return a session cookie for ${identity.login}`);
  return cookie;
}

async function isCookieAlive(cookieHeader) {
  if (!cookieHeader) return false;
  try {
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(openFrontendTimeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function setupIdentity(index, adminCookie) {
  const suffix = `${Date.now()}-${index}`;
  const login = `solo-load-${suffix}`;
  const password = "solo-load-password";
  const user = await request("/admin/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: `Solo Load ${index}`,
      login,
      password,
    }),
  });
  const key = await request("/api-keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      label: `solo-load-${suffix}`,
      max_uses: 10000,
      user_id: user.id,
    }),
  });
  return { login, password, user, key };
}

async function loadOrCreateIdentities() {
  if (authMode === "api-key-only") {
    if (apiKeyList.length < browserCount) {
      throw new Error(
        `EOPP_SOLO_FRONTEND_API_KEYS must contain at least ${browserCount} key(s) in api-key-only mode`,
      );
    }
    return {
      identities: apiKeyList.slice(0, browserCount).map((key, index) => ({
        login: `api-key-only-${index}`,
        user: null,
        key: { key, id: null, label: `api-key-only-${index}` },
      })),
      identitiesCreated: false,
    };
  }

  if (userLoginList.length > 0 || userPasswordList.length > 0 || apiKeyList.length > 0) {
    if (
      userLoginList.length < browserCount ||
      userPasswordList.length < browserCount ||
      apiKeyList.length < browserCount
    ) {
      throw new Error(
        "EOPP_SOLO_FRONTEND_USER_LOGINS, EOPP_SOLO_FRONTEND_USER_PASSWORDS, and EOPP_SOLO_FRONTEND_API_KEYS must each contain at least " +
          `${browserCount} value(s) when using existing session users`,
      );
    }
    return {
      identities: Array.from({ length: browserCount }, (_, index) => ({
        login: userLoginList[index],
        password: userPasswordList[index],
        user: null,
        key: { key: apiKeyList[index], id: null, label: userLoginList[index] },
      })),
      identitiesCreated: false,
    };
  }

  if (!refreshAuth && fs.existsSync(identitiesPath)) {
    const cached = readJson(identitiesPath);
    if (Array.isArray(cached.identities) && cached.identities.length >= browserCount) {
      return { identities: cached.identities.slice(0, browserCount), identitiesCreated: false };
    }
  }

  const adminCookie = await setupAdminCookie();
  const identities = [];
  for (let index = 0; index < browserCount; index += 1) {
    identities.push(await setupIdentity(index, adminCookie));
  }
  writeJson(identitiesPath, { created_at: new Date().toISOString(), base_url: baseUrl, identities });
  return { identities, identitiesCreated: true };
}

async function ensureUserCookie(identity, index) {
  if (authMode === "api-key-only") {
    return { cookie: "", authCache: "api-key-only" };
  }

  const statePath = path.join(workDir, `auth-state-${index}.json`);
  if (!refreshAuth && fs.existsSync(statePath)) {
    const state = readJson(statePath);
    if (state.login === identity.login && await isCookieAlive(state.cookie)) {
      return { cookie: state.cookie, authCache: "hit" };
    }
  }

  const cookie = await loginUser(identity);
  writeJson(statePath, {
    login: identity.login,
    user_id: identity.user?.id,
    api_key_id: identity.key?.id,
    cookie,
    updated_at: new Date().toISOString(),
  });
  return { cookie, authCache: "miss" };
}

async function authMe(cookieHeader) {
  const response = await fetch(`${baseUrl}/auth/me`, {
    headers: { cookie: cookieHeader },
    signal: AbortSignal.timeout(openFrontendTimeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`/auth/me failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function resolveOperatorUuid(login, password, explicitUuid) {
  if (explicitUuid) return { uuid: explicitUuid, cookie: "", authCache: "uuid-env" };
  const cookie = await loginUser({ login, password });
  const me = await authMe(cookie);
  const operatorProfile = me?.user?.operator_profile;
  const uuid = operatorProfile?.uuid;
  if (!uuid) {
    throw new Error(`user ${login} has no active operator_profile.uuid in /auth/me`);
  }
  return { uuid, cookie, authCache: "miss" };
}

async function validateMasterKey(apiKey) {
  const response = await fetch(`${baseUrl}/validate-key?api_key=${encodeURIComponent(apiKey)}`, {
    signal: AbortSignal.timeout(openFrontendTimeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || !body?.valid) {
    throw new Error(`/validate-key failed for distributed master: ${response.status} ${text.slice(0, 500)}`);
  }
  return body;
}

async function listOperatorMasters(uuid) {
  const response = await fetch(`${baseUrl}/operators/${encodeURIComponent(uuid)}/masters`, {
    signal: AbortSignal.timeout(openFrontendTimeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || !Array.isArray(body)) {
    throw new Error(`/operators/${uuid}/masters failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return body;
}

function queryCaptchaFilesFromDb() {
  const script = String.raw`
import json
import sqlite3
import sys

db_path = sys.argv[1]
con = sqlite3.connect(db_path)
con.row_factory = sqlite3.Row
rows = con.execute(
    """
    select captcha_id, file_path, file_status, captcha_type, classification,
           variants_count, has_coordinates, has_boxes
    from captcha_files
    where captcha_id is not null and file_path is not null
    order by id
    """
).fetchall()
con.close()
print(json.dumps([dict(row) for row in rows], ensure_ascii=False))
`;
  const output = execFileSync("uv", ["run", "python", "-c", script, dbPath], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function resolveCaptchaPath(row) {
  const byId = path.join(captchaDir, `${row.captcha_id}.json`);
  if (fs.existsSync(byId)) return byId;

  const rawPath = row.file_path || "";
  const fileName = path.basename(rawPath.replaceAll("\\", "/"));
  if (fileName) {
    const byName = path.join(captchaDir, fileName);
    if (fs.existsSync(byName)) return byName;
  }
  return null;
}

function isIconClickPayload(payload) {
  const puzzle = payload?.puzzle || {};
  return Boolean(puzzle.imageBase64 && puzzle.iconsBase64);
}

function loadIconClickPool() {
  const rows = queryCaptchaFilesFromDb();
  const pool = [];
  const seen = new Set();

  for (const row of rows) {
    if (!row.captcha_id || seen.has(row.captcha_id)) continue;
    const payloadPath = resolveCaptchaPath(row);
    if (!payloadPath) continue;
    let payload;
    try {
      payload = readJson(payloadPath);
    } catch {
      continue;
    }
    if (!isIconClickPayload(payload)) continue;
    seen.add(row.captcha_id);
    pool.push({ row, payloadPath, payload });
  }

  if (pool.length < browserCount * captchasPerBrowser) {
    throw new Error(
      `not enough real icon-click payloads: found ${pool.length}, need ${browserCount * captchasPerBrowser}; db=${dbPath}; dir=${captchaDir}`,
    );
  }
  return { rowsCount: rows.length, pool };
}

function payloadFor(pool, round, index, slot) {
  const poolIndex =
    (captchaPoolOffset + round * browserCount * captchasPerBrowser + index * captchasPerBrowser + slot) %
    pool.length;
  const selected = pool[poolIndex];
  const body = cloneJson(selected.payload);
  body.api_key = undefined;
  body.auto_solve = false;
  body.auto_solve_rucaptcha = false;
  body.timeout_metadata = true;
  body.test_no_timeout = testNoTimeout;
  body.reservation_id = `${runId}-icon-click-${round}-${index}-${slot}`;
  return {
    body,
    source: {
      captcha_id: selected.row.captcha_id,
      file_status: selected.row.file_status,
      classification: selected.row.classification,
      payload_path: selected.payloadPath,
    },
  };
}

async function openFrontend(identity, index) {
  const userDataDir = path.join(workDir, `profile-${index}`);
  fs.rmSync(userDataDir, { force: true, recursive: true });
  const { cookie, authCache } = await ensureUserCookie(identity, index);
  const windowBounds = windowBoundsForIndex(index);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    devtools,
    ignoreHTTPSErrors: ignoreHttpsErrors,
    viewport: windowBounds
      ? { width: Math.max(640, windowBounds.width - 16), height: Math.max(480, windowBounds.height - 96) }
      : { width: 1280, height: 900 },
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      ...(devtools ? ["--auto-open-devtools-for-tabs"] : []),
      ...(windowBounds
        ? [
            `--window-position=${windowBounds.x},${windowBounds.y}`,
            `--window-size=${windowBounds.width},${windowBounds.height}`,
          ]
        : []),
    ],
  });
  if (authMode !== "api-key-only") {
    const sessionValue = parseCookiePair(cookie, "eopp_admin_session");
    if (!sessionValue) {
      throw new Error(`missing eopp_admin_session cookie for ${identity.login}`);
    }
    await context.addCookies([
      {
        name: "eopp_admin_session",
        value: sessionValue,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  await context.addInitScript((apiKey) => {
    localStorage.setItem("kiosk_api_key", apiKey);
    localStorage.setItem("admin_session_active", "1");
  }, identity.key.key);
  const page = context.pages()[0] || (await context.newPage());
  const consoleMessages = [];
  const requestFailures = [];
  const apiResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url(), failure: request.failure()?.errorText });
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/solve") && !url.includes("/stream") && !url.includes("/auth/me") && !url.includes("/validate-key")) return;
    let body = "";
    if (!url.includes("/stream")) {
      try {
        body = (await response.text()).slice(0, 500);
      } catch {
        body = "";
      }
    }
    apiResponses.push({ url, status: response.status(), body });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: openFrontendTimeoutMs });
  await page.waitForFunction(
    () => document.body && document.body.innerText.length > 0,
    null,
    { timeout: openFrontendTimeoutMs },
  );
  const takeoverButton = page.locator('[data-eopp-component="StatusBarForceReconnectButton"]').first();
  if (await takeoverButton.isVisible({ timeout: 1500 }).catch(() => false)) {
    await takeoverButton.click();
    await takeoverButton.waitFor({ state: "hidden", timeout: openFrontendTimeoutMs }).catch(() => {});
    await page.waitForFunction(
      () => !document.querySelector('[data-eopp-component="StatusBarForceReconnectButton"]'),
      null,
      { timeout: openFrontendTimeoutMs },
    ).catch(() => {});
  }
  await delay(500);

  return { context, page, consoleMessages, requestFailures, apiResponses, authCache };
}

async function openOperatorFrontend(operator, index) {
  const userDataDir = path.join(workDir, `operator-profile-${index}`);
  fs.rmSync(userDataDir, { force: true, recursive: true });
  const windowBounds = windowBoundsForIndex(index);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    devtools,
    ignoreHTTPSErrors: ignoreHttpsErrors,
    viewport: windowBounds
      ? { width: Math.max(640, windowBounds.width - 16), height: Math.max(480, windowBounds.height - 96) }
      : { width: 1280, height: 900 },
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      ...(devtools ? ["--auto-open-devtools-for-tabs"] : []),
      ...(windowBounds
        ? [
            `--window-position=${windowBounds.x},${windowBounds.y}`,
            `--window-size=${windowBounds.width},${windowBounds.height}`,
          ]
        : []),
    ],
  });

  const page = context.pages()[0] || (await context.newPage());
  const consoleMessages = [];
  const requestFailures = [];
  const apiResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url(), failure: request.failure()?.errorText });
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (
      !url.includes("/distribution/answer") &&
      !url.includes("/operators/") &&
      !url.includes("/stream")
    ) {
      return;
    }
    let body = "";
    if (!url.includes("/stream")) {
      try {
        body = (await response.text()).slice(0, 500);
      } catch {
        body = "";
      }
    }
    apiResponses.push({ url, status: response.status(), body });
  });

  await page.goto(`${baseUrl}/operators/${encodeURIComponent(operator.uuid)}`, {
    waitUntil: "domcontentloaded",
    timeout: openFrontendTimeoutMs,
  });
  await page.waitForFunction(
    () => document.body && document.body.innerText.length > 0,
    null,
    { timeout: openFrontendTimeoutMs },
  );
  await delay(500);

  return { context, page, consoleMessages, requestFailures, apiResponses, authCache: operator.authCache };
}

async function pageDiagnostics(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1000),
    statusBarText:
      document.querySelector('[data-eopp-component="StatusBar"]')?.textContent?.slice(0, 500) || "",
    captchaPanelText: document.querySelector(".captcha-panel")?.textContent?.slice(0, 500) || "",
    clickSurfaceCount: document.querySelectorAll(".captcha-click-surface__image").length,
    markerCount: document.querySelectorAll(".captcha-click-surface__marker").length,
    cardCount: document.querySelectorAll(".captcha-card").length,
    legacyIconImageCount: document.querySelectorAll('img[alt="Капча"]').length,
    imageCount: document.querySelectorAll('.captcha-click-surface__image, .captcha-card img, img[alt="Капча"]').length,
  }));
}

async function solveCaptcha(identity, selected) {
  const response = await fetch(`${baseUrl}/solve-captcha`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(solveCaptchaTimeoutMs),
    body: JSON.stringify({
      ...selected.body,
      api_key: identity.key.key,
    }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, source: selected.source };
}

async function clickFrontendCaptcha(frontend, round, index, solveDelayMs, slot) {
  const page = frontend.page;
  const started = performance.now();
  const image = page.locator('.captcha-click-surface__image, img[alt="Капча"]').first();
  try {
    await image.waitFor({ state: "visible", timeout: imageVisibleTimeoutMs });
  } catch (error) {
    const diagnostics = await pageDiagnostics(page);
    error.message += ` diagnostics=${JSON.stringify(diagnostics)}`;
    throw error;
  }
  const appearedMs = performance.now() - started;
  await delay(solveDelayMs);

  const box = await image.boundingBox();
  if (!box) throw new Error(`icon-click image has no box for browser ${index}`);
  const initialImageSrc = await image.evaluate((node) => node.getAttribute("src") || "");
  const beforeMarkers = await page.locator(".captcha-click-surface__marker").count().catch(() => 0);
  const solveResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/solve") && response.request().method() === "POST",
    { timeout: solveResponseTimeoutMs },
  );

  for (let clickIndex = 0; clickIndex < clickCount; clickIndex += 1) {
    const x = box.x + randomInt(Math.floor(box.width * 0.12), Math.floor(box.width * 0.88));
    const y = box.y + randomInt(Math.floor(box.height * 0.12), Math.floor(box.height * 0.88));
    await page.mouse.click(x, y);
    if (clickIntervalMs > 0) {
      await delay(clickIntervalMs);
    }
  }

  const clickedMs = performance.now() - started;
  try {
    const solveResponse = await solveResponsePromise;
    if (!solveResponse.ok()) {
      const body = await solveResponse.text().catch(() => "");
      throw new Error(`/solve returned ${solveResponse.status()}: ${body.slice(0, 500)}`);
    }
    await page.waitForFunction(
      ({ markerCount, imageSrc }) => {
        const activeImage = document.querySelector('.captcha-click-surface__image, img[alt="Капча"]');
        return (
          !activeImage ||
          activeImage.getAttribute("src") !== imageSrc ||
          document.querySelectorAll(".captcha-click-surface__marker").length > markerCount
        );
      },
      { markerCount: beforeMarkers, imageSrc: initialImageSrc },
      { timeout: solveResponseTimeoutMs },
    );
  } catch (error) {
    const diagnostics = await pageDiagnostics(page);
    error.message += ` diagnostics=${JSON.stringify(diagnostics)}`;
    throw error;
  }
  const solvedMs = performance.now() - started;
  return { round, index, slot, appearedMs, solveDelayMs, clickedMs, solvedMs };
}

async function clickDistributedCaptcha(frontend, round, groupIndex, participantIndex, participantCount, solveDelayMs, slot) {
  const page = frontend.page;
  const started = performance.now();
  const image = page.locator(".captcha-click-surface__image").first();
  try {
    await image.waitFor({ state: "visible", timeout: imageVisibleTimeoutMs });
  } catch (error) {
    const diagnostics = await pageDiagnostics(page);
    error.message += ` diagnostics=${JSON.stringify(diagnostics)}`;
    throw error;
  }
  const appearedMs = performance.now() - started;
  await delay(solveDelayMs);

  const clickLimit = distributedClickLayouts[participantCount]?.[participantIndex] || clickCount;
  for (let clickIndex = 0; clickIndex < clickLimit; clickIndex += 1) {
    if (!(await image.isVisible({ timeout: 250 }).catch(() => false))) break;
    const box = await image.boundingBox();
    if (!box) break;
    const answerPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/distribution/answer") &&
        response.request().method() === "POST",
      { timeout: solveResponseTimeoutMs },
    );
    const x = box.x + randomInt(Math.floor(box.width * 0.12), Math.floor(box.width * 0.88));
    const y = box.y + randomInt(Math.floor(box.height * 0.12), Math.floor(box.height * 0.88));
    await page.mouse.click(x, y);
    let answer;
    try {
      answer = await answerPromise;
    } catch (error) {
      const diagnostics = await pageDiagnostics(page);
      error.message += ` diagnostics=${JSON.stringify(diagnostics)}`;
      throw error;
    }
    if (!answer.ok()) {
      const body = await answer.text().catch(() => "");
      if (answer.status() === 404 && body.includes("Distribution state not found")) {
        break;
      }
      throw new Error(`/distribution/answer returned ${answer.status()}: ${body.slice(0, 500)}`);
    }
    let body = null;
    try {
      body = await answer.json();
    } catch {
      body = null;
    }
    if (clickIntervalMs > 0) {
      await delay(clickIntervalMs);
    }
    if (body?.complete || body?.coordinates || body?.waiting) break;
  }

  const clickedMs = performance.now() - started;
  return { round, group: groupIndex, participant: participantIndex, slot, appearedMs, solveDelayMs, clickedMs, solvedMs: clickedMs };
}

function summarizeFrontends(frontends) {
  return {
    console_error_count: frontends.reduce((sum, item) => sum + item.consoleMessages.length, 0),
    request_failure_count: frontends.reduce((sum, item) => sum + item.requestFailures.length, 0),
    api_responses: frontends.flatMap((item, index) =>
      item.apiResponses.slice(-10).map((response) => ({ browser: index, ...response })),
    ).slice(0, 80),
    console_errors: frontends.flatMap((item, index) =>
      item.consoleMessages.slice(0, 5).map((message) => ({ browser: index, ...message })),
    ).slice(0, 20),
    request_failures: frontends.flatMap((item, index) =>
      item.requestFailures.slice(0, 5).map((failure) => ({ browser: index, ...failure })),
    ).slice(0, 20),
  };
}

function distributedPayloadFor(pool, round, groupIndex, slot) {
  const poolIndex =
    (captchaPoolOffset + round * distributedMasterCount * captchasPerBrowser + groupIndex * captchasPerBrowser + slot) %
    pool.length;
  const selected = pool[poolIndex];
  const body = cloneJson(selected.payload);
  body.api_key = undefined;
  body.auto_solve = false;
  body.auto_solve_rucaptcha = false;
  body.timeout_metadata = true;
  body.test_no_timeout = testNoTimeout;
  body.reservation_id = `${runId}-distributed-icon-click-${round}-${groupIndex}-${slot}`;
  return {
    body,
    source: {
      captcha_id: selected.row.captcha_id,
      file_status: selected.row.file_status,
      classification: selected.row.classification,
      payload_path: selected.payloadPath,
    },
  };
}

function buildDistributedGroups() {
  if (distributedMasterCount > 3) {
    throw new Error("EOPP_DISTRIBUTED_MASTER_COUNT must be <= 3");
  }
  if (distributedOperatorsPerMaster > 3) {
    throw new Error("EOPP_DISTRIBUTED_OPERATORS_PER_MASTER must be <= 3");
  }

  const masterLogins = distributedMasterLogins.length ? distributedMasterLogins : userLoginList.slice(0, distributedMasterCount);
  const masterPasswords = distributedMasterPasswords.length
    ? distributedMasterPasswords
    : userPasswordList.slice(0, distributedMasterCount);
  const masterKeys = distributedMasterApiKeys.length ? distributedMasterApiKeys : apiKeyList.slice(0, distributedMasterCount);

  if (
    masterLogins.length < distributedMasterCount ||
    masterPasswords.length < distributedMasterCount ||
    masterKeys.length < distributedMasterCount
  ) {
    throw new Error(
      "distributed mode requires master logins, passwords, and api keys for each master " +
        "(EOPP_DISTRIBUTED_MASTER_LOGINS/PASSWORDS/API_KEYS)",
    );
  }

  let operatorLogins = distributedOperatorLogins;
  let operatorPasswords = distributedOperatorPasswords;
  if (!operatorLogins.length && userLoginList.length >= distributedMasterCount * (1 + distributedOperatorsPerMaster)) {
    operatorLogins = Array.from({ length: distributedMasterCount }, (_, groupIndex) => {
      const start = distributedMasterCount + groupIndex * distributedOperatorsPerMaster;
      return userLoginList.slice(start, start + distributedOperatorsPerMaster);
    });
    operatorPasswords = Array.from({ length: distributedMasterCount }, (_, groupIndex) => {
      const start = distributedMasterCount + groupIndex * distributedOperatorsPerMaster;
      return userPasswordList.slice(start, start + distributedOperatorsPerMaster);
    });
  }

  return Array.from({ length: distributedMasterCount }, (_, groupIndex) => {
    const operatorCount = operatorLogins[groupIndex]?.length || distributedOperatorsPerMaster;
    const operators = Array.from({ length: operatorCount }, (_, operatorIndex) => ({
      login: operatorLogins[groupIndex]?.[operatorIndex] || "",
      password: operatorPasswords[groupIndex]?.[operatorIndex] || "",
      uuid: distributedOperatorUuids[groupIndex]?.[operatorIndex] || "",
    }));
    for (const operator of operators) {
      if (!operator.uuid && (!operator.login || !operator.password)) {
        throw new Error(
          `distributed operator group ${groupIndex} is missing login/password or uuid for one operator`,
        );
      }
    }
    return {
      master: {
        login: masterLogins[groupIndex],
        password: masterPasswords[groupIndex],
        key: { key: masterKeys[groupIndex], id: null, label: masterLogins[groupIndex] },
      },
      operators,
    };
  });
}

async function mainMasterOperators() {
  fs.mkdirSync(workDir, { recursive: true });
  const contexts = [];
  const frontends = [];
  const results = [];
  const failures = [];
  const captchaSources = [];
  let captchaPoolInfo = null;
  const authCache = {};

  try {
    const { rowsCount, pool } = loadIconClickPool();
    captchaPoolInfo = {
      db_path: dbPath,
      captcha_dir: captchaDir,
      db_rows: rowsCount,
      icon_click_payloads: pool.length,
      samples: pool.slice(0, 8).map((item) => ({
        captcha_id: item.row.captcha_id,
        classification: item.row.classification,
        file_status: item.row.file_status,
      })),
    };

    const groups = buildDistributedGroups();
    const openedGroups = [];
    let windowBase = 0;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      const opened = { master: null, operators: [] };
      let masterKeyInfo = null;
      try {
        masterKeyInfo = await validateMasterKey(group.master.key.key);
        group.master.key.id = masterKeyInfo.api_key_id;
        group.master.key.label = masterKeyInfo.label || group.master.login;
      } catch (error) {
        failures.push({ round: null, group: groupIndex, participant: 0, stage: "validate-master-key", error: errorDetails(error) });
        break;
      }
      try {
        const masterFrontend = await openFrontend(group.master, windowBase);
        opened.master = masterFrontend;
        frontends.push(masterFrontend);
        contexts.push(masterFrontend.context);
        authCache[`master:${masterFrontend.authCache}`] = (authCache[`master:${masterFrontend.authCache}`] || 0) + 1;
      } catch (error) {
        failures.push({ round: null, group: groupIndex, participant: 0, stage: "open-master", error: errorDetails(error) });
        break;
      }

      for (let operatorIndex = 0; operatorIndex < group.operators.length; operatorIndex += 1) {
        try {
          const resolved = await resolveOperatorUuid(
            group.operators[operatorIndex].login,
            group.operators[operatorIndex].password,
            group.operators[operatorIndex].uuid,
          );
          const operatorMasters = await listOperatorMasters(resolved.uuid);
          const assigned = operatorMasters.find((master) => master.assigned);
          if (!assigned || Number(assigned.id) !== Number(masterKeyInfo.api_key_id)) {
            throw new Error(
              `operator ${group.operators[operatorIndex].login || resolved.uuid} is assigned to ` +
                `${assigned ? `${assigned.label || assigned.id} (#${assigned.id})` : "no master"}, ` +
                `expected ${masterKeyInfo.label || group.master.login} (#${masterKeyInfo.api_key_id})`,
            );
          }
          const operatorFrontend = await openOperatorFrontend(
            {
              ...group.operators[operatorIndex],
              uuid: resolved.uuid,
              authCache: resolved.authCache,
            },
            windowBase + operatorIndex + 1,
          );
          opened.operators.push(operatorFrontend);
          frontends.push(operatorFrontend);
          contexts.push(operatorFrontend.context);
          authCache[`operator:${operatorFrontend.authCache}`] =
            (authCache[`operator:${operatorFrontend.authCache}`] || 0) + 1;
        } catch (error) {
          failures.push({
            round: null,
            group: groupIndex,
            participant: operatorIndex + 1,
            stage: "open-operator",
            error: errorDetails(error),
          });
          break;
        }
        if (openFrontendStaggerMs > 0) {
          await delay(openFrontendStaggerMs);
        }
      }
      openedGroups.push(opened);
      windowBase += 1 + group.operators.length;
    }

    const ready = failures.length === 0 && openedGroups.length === groups.length;
    for (let round = 0; round < (ready ? rounds : 0); round += 1) {
      const solveJobs = [];
      if (distributedQueueMode === "batch") {
        for (let slot = 0; slot < captchasPerBrowser; slot += 1) {
          const selectedPayloads = groups.map((_, groupIndex) => distributedPayloadFor(pool, round, groupIndex, slot));
          solveJobs.push(
            ...groups.map((group, groupIndex) =>
              solveCaptcha(group.master, selectedPayloads[groupIndex])
                .then((solveResult) => ({ groupIndex, slot, solveResult }))
                .catch((error) => ({
                  groupIndex,
                  slot,
                  solveError: errorDetails(error),
                  source: selectedPayloads[groupIndex].source,
                })),
            ),
          );
        }
      }
      for (let slot = 0; slot < captchasPerBrowser; slot += 1) {
        const selectedPayloads =
          distributedQueueMode === "batch"
            ? []
            : groups.map((_, groupIndex) => distributedPayloadFor(pool, round, groupIndex, slot));
        const slotSolveJobs =
          distributedQueueMode === "batch"
            ? []
            : groups.map((group, groupIndex) =>
                solveCaptcha(group.master, selectedPayloads[groupIndex])
                  .then((solveResult) => ({ groupIndex, slot, solveResult }))
                  .catch((error) => ({
                    groupIndex,
                    slot,
                    solveError: errorDetails(error),
                    source: selectedPayloads[groupIndex].source,
                  })),
              );

        const clickParticipants = openedGroups.flatMap((group, groupIndex) =>
          [group.master, ...group.operators].map((frontend, participantIndex) => ({
            frontend,
            groupIndex,
            participantIndex,
            participantCount: 1 + group.operators.length,
          })),
        );
        const clickResults = await Promise.allSettled(
          clickParticipants.map(({ frontend, groupIndex, participantIndex, participantCount }) =>
            clickDistributedCaptcha(frontend, round, groupIndex, participantIndex, participantCount, solveDelayMs, slot),
          ),
        );
        for (const [resultIndex, clickResult] of clickResults.entries()) {
          const { groupIndex, participantIndex } = clickParticipants[resultIndex];
          if (clickResult.status === "fulfilled") {
            results.push(clickResult.value);
          } else {
            failures.push({
              round,
              group: groupIndex,
              participant: participantIndex,
              slot,
              stage: "distributed-frontend-click",
              error: clickResult.reason?.message || String(clickResult.reason),
            });
          }
        }
        if (distributedQueueMode !== "batch") {
          const solveResults = await Promise.all(slotSolveJobs);
          for (const { groupIndex, slot: solvedSlot, solveResult, solveError, source } of solveResults) {
            captchaSources.push({ round, group: groupIndex, slot: solvedSlot, ...(solveResult?.source || source || {}) });
            if (solveError) {
              failures.push({ round, group: groupIndex, slot: solvedSlot, stage: "solve-captcha-exception", error: solveError, source });
              continue;
            }
            if (solveResult.status !== 200) {
              failures.push({ round, group: groupIndex, slot: solvedSlot, stage: "solve-captcha", solveResult });
            } else if (solveResult.body?.status === "timeout") {
              failures.push({ round, group: groupIndex, slot: solvedSlot, stage: "solve-captcha-timeout", solveResult });
            }
          }
        }
      }
      if (distributedQueueMode === "batch") {
        const solveResults = await Promise.all(solveJobs);
        for (const { groupIndex, slot, solveResult, solveError, source } of solveResults) {
          captchaSources.push({ round, group: groupIndex, slot, ...(solveResult?.source || source || {}) });
          if (solveError) {
            failures.push({ round, group: groupIndex, slot, stage: "solve-captcha-exception", error: solveError, source });
            continue;
          }
          if (solveResult.status !== 200) {
            failures.push({ round, group: groupIndex, slot, stage: "solve-captcha", solveResult });
          } else if (solveResult.body?.status === "timeout") {
            failures.push({ round, group: groupIndex, slot, stage: "solve-captcha-timeout", solveResult });
          }
        }
      }
    }

    const appeared = results.map((item) => item.appearedMs);
    const solveDelays = results.map((item) => item.solveDelayMs);
    const clicked = results.map((item) => item.clickedMs);
    const solved = results.map((item) => item.solvedMs);
    const frontendSummary = summarizeFrontends(frontends);
    const summary = {
      base_url: baseUrl,
      run_id: runId,
      scenario,
      auth_mode: authMode,
      ignore_https_errors: ignoreHttpsErrors,
      master_count: distributedMasterCount,
      operators_per_master: distributedOperatorsPerMaster,
      operator_counts: groups.map((group) => group.operators.length),
      windows: frontends.length,
      rounds,
      captchas_per_master_per_round: captchasPerBrowser,
      total_expected_master_captchas: distributedMasterCount * rounds * captchasPerBrowser,
      participant_click_flows_ok: results.length,
      failed: failures.length,
      captcha_type: "icon-click",
      test_no_timeout: testNoTimeout,
      distributed_queue_mode: distributedQueueMode,
      icon_click_clicks_per_captcha: clickCount,
      hold_after_ms: holdAfterMs,
      icon_click_interval_ms: clickIntervalMs,
      open_frontend_stagger_ms: openFrontendStaggerMs,
      captcha_pool: captchaPoolInfo,
      captcha_sources: captchaSources.slice(0, 40),
      solve_delay_ms: solveDelayMs,
      auth_cache: authCache,
      appeared: summarize(appeared),
      solve_delay: summarize(solveDelays),
      clicked: summarize(clicked),
      solved: summarize(solved),
      ...frontendSummary,
      failures: failures.slice(0, 30),
    };

    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    if (holdAfterMs > 0) {
      await delay(holdAfterMs);
    }
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

async function main() {
  fs.mkdirSync(workDir, { recursive: true });
  const contexts = [];
  const results = [];
  const failures = [];
  const frontends = [];
  const captchaSources = [];
  let identitiesCreated = false;
  let captchaPoolInfo = null;

  try {
    const { rowsCount, pool } = loadIconClickPool();
    captchaPoolInfo = {
      db_path: dbPath,
      captcha_dir: captchaDir,
      db_rows: rowsCount,
      icon_click_payloads: pool.length,
      samples: pool.slice(0, 8).map((item) => ({
        captcha_id: item.row.captcha_id,
        classification: item.row.classification,
        file_status: item.row.file_status,
      })),
    };

    const identityState = await loadOrCreateIdentities();
    identitiesCreated = identityState.identitiesCreated;
    const identities = identityState.identities;

    for (let index = 0; index < browserCount; index += 1) {
      try {
        const frontend = await openFrontend(identities[index], index);
        frontends.push(frontend);
        contexts.push(frontend.context);
      } catch (error) {
        failures.push({
          round: null,
          index,
          slot: null,
          stage: "open-frontend",
          error: errorDetails(error),
        });
        break;
      }
      if (openFrontendStaggerMs > 0 && index < browserCount - 1) {
        await delay(openFrontendStaggerMs);
      }
    }

    for (let round = 0; round < (frontends.length === browserCount ? rounds : 0); round += 1) {
      const selectedPayloads = identities.map((_, index) =>
        Array.from({ length: captchasPerBrowser }, (_, slot) => payloadFor(pool, round, index, slot)),
      );
      const solveJobs = identities.flatMap((identity, index) =>
        selectedPayloads[index].map((selected, slot) =>
          solveCaptcha(identity, selected)
            .then((solveResult) => ({ round, index, slot, solveResult }))
            .catch((error) => ({
              round,
              index,
              slot,
              solveError: errorDetails(error),
              source: selected.source,
            })),
        ),
      );
      const solveResultsPromise = Promise.all(solveJobs);
      const clickResultsBySlot = [];

      for (let slot = 0; slot < captchasPerBrowser; slot += 1) {
        const clickPromises = frontends.map((frontend, index) =>
          clickFrontendCaptcha(frontend, round, index, solveDelayMs, slot),
        );
        clickResultsBySlot.push(...(await Promise.allSettled(clickPromises)));
      }

      const solveResults = await solveResultsPromise;

      for (const { index, slot, solveResult, solveError, source } of solveResults) {
        captchaSources.push({ round, index, slot, ...(solveResult?.source || source || {}) });
        if (solveError) {
          failures.push({ round, index, slot, stage: "solve-captcha-exception", error: solveError, source });
          continue;
        }
        if (solveResult.status !== 200) {
          failures.push({ round, index, slot, stage: "solve-captcha", solveResult });
        } else if (solveResult.body?.status === "timeout") {
          failures.push({ round, index, slot, stage: "solve-captcha-timeout", solveResult });
        }
      }
      for (const [resultIndex, clickResult] of clickResultsBySlot.entries()) {
        const index = resultIndex % browserCount;
        const slot = Math.floor(resultIndex / browserCount);
        if (clickResult.status === "fulfilled") {
          results.push(clickResult.value);
        } else {
          failures.push({
            round,
            index,
            slot,
            stage: "frontend-icon-click",
            error: clickResult.reason?.message || String(clickResult.reason),
          });
        }
      }
    }

    const appeared = results.map((item) => item.appearedMs);
    const solveDelays = results.map((item) => item.solveDelayMs);
    const clicked = results.map((item) => item.clickedMs);
    const solved = results.map((item) => item.solvedMs);
    const summary = {
      base_url: baseUrl,
      run_id: runId,
      auth_mode: authMode,
      ignore_https_errors: ignoreHttpsErrors,
      browsers: browserCount,
      rounds,
      captchas_per_browser_per_round: captchasPerBrowser,
      total_expected: browserCount * rounds * captchasPerBrowser,
      ok: results.length,
      failed: failures.length,
      captcha_type: "icon-click",
      test_no_timeout: testNoTimeout,
      icon_click_clicks_per_captcha: clickCount,
      hold_after_ms: holdAfterMs,
      icon_click_interval_ms: clickIntervalMs,
      open_frontend_stagger_ms: openFrontendStaggerMs,
      open_frontend_timeout_ms: openFrontendTimeoutMs,
      solve_captcha_timeout_ms: solveCaptchaTimeoutMs,
      image_visible_timeout_ms: imageVisibleTimeoutMs,
      solve_response_timeout_ms: solveResponseTimeoutMs,
      captcha_pool: captchaPoolInfo,
      captcha_sources: captchaSources.slice(0, 40),
      solve_delay_ms: solveDelayMs,
      identities_created: identitiesCreated,
      auth_cache: frontends.reduce((acc, item) => {
        acc[item.authCache] = (acc[item.authCache] || 0) + 1;
        return acc;
      }, {}),
      appeared: summarize(appeared),
      solve_delay: summarize(solveDelays),
      clicked: summarize(clicked),
      solved: summarize(solved),
      console_error_count: frontends.reduce((sum, item) => sum + item.consoleMessages.length, 0),
      request_failure_count: frontends.reduce((sum, item) => sum + item.requestFailures.length, 0),
      api_responses: frontends.flatMap((item, index) =>
        item.apiResponses.slice(-10).map((response) => ({ browser: index, ...response })),
      ).slice(0, 40),
      console_errors: frontends.flatMap((item, index) =>
        item.consoleMessages.slice(0, 5).map((message) => ({ browser: index, ...message })),
      ).slice(0, 20),
      request_failures: frontends.flatMap((item, index) =>
        item.requestFailures.slice(0, 5).map((failure) => ({ browser: index, ...failure })),
      ).slice(0, 20),
      failures: failures.slice(0, 20),
    };

    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    if (holdAfterMs > 0) {
      await delay(holdAfterMs);
    }
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

const entrypoint = scenario === "master-operators" ? mainMasterOperators : main;

entrypoint().catch((error) => {
  console.error(error);
  process.exit(1);
});
