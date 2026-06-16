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
const rounds = Number(process.env.EOPP_SOLO_FRONTEND_ROUNDS || 10);
const captchasPerBrowser = Number(process.env.EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER || 1);
const headless = process.env.EOPP_SOLO_FRONTEND_HEADLESS === "1";
const solveDelayMs = Number(process.env.EOPP_SOLO_FRONTEND_SOLVE_DELAY_MS || 0);
const clickIntervalMs = Number(process.env.EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS || 1000);
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

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
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
    const response = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: cookieHeader } });
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
  const poolIndex = (round * browserCount * captchasPerBrowser + index * captchasPerBrowser + slot) % pool.length;
  const selected = pool[poolIndex];
  const body = cloneJson(selected.payload);
  body.api_key = undefined;
  body.auto_solve = false;
  body.auto_solve_rucaptcha = false;
  body.timeout_metadata = true;
  body.test_no_timeout = true;
  body.reservation_id = `solo-icon-click-${round}-${index}-${slot}`;
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

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    ignoreHTTPSErrors: ignoreHttpsErrors,
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-first-run",
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body && document.body.innerText.length > 0, null, { timeout: 15000 });
  await delay(500);

  return { context, page, consoleMessages, requestFailures, apiResponses, authCache };
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
    await image.waitFor({ state: "visible", timeout: 10000 });
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
    { timeout: 10000 },
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
      { timeout: 10000 },
    );
  } catch (error) {
    const diagnostics = await pageDiagnostics(page);
    error.message += ` diagnostics=${JSON.stringify(diagnostics)}`;
    throw error;
  }
  const solvedMs = performance.now() - started;
  return { round, index, slot, appearedMs, solveDelayMs, clickedMs, solvedMs };
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
      const frontend = await openFrontend(identities[index], index);
      frontends.push(frontend);
      contexts.push(frontend.context);
    }

    for (let round = 0; round < rounds; round += 1) {
      const selectedPayloads = identities.map((_, index) =>
        Array.from({ length: captchasPerBrowser }, (_, slot) => payloadFor(pool, round, index, slot)),
      );
      const solveJobs = identities.flatMap((identity, index) =>
        selectedPayloads[index].map((selected, slot) =>
          solveCaptcha(identity, selected).then((solveResult) => ({ round, index, slot, solveResult })),
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

      for (const { index, slot, solveResult } of solveResults) {
        captchaSources.push({ round, index, slot, ...solveResult.source });
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
      auth_mode: authMode,
      ignore_https_errors: ignoreHttpsErrors,
      browsers: browserCount,
      rounds,
      captchas_per_browser_per_round: captchasPerBrowser,
      total_expected: browserCount * rounds * captchasPerBrowser,
      ok: results.length,
      failed: failures.length,
      captcha_type: "icon-click",
      icon_click_clicks_per_captcha: clickCount,
      icon_click_interval_ms: clickIntervalMs,
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
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
