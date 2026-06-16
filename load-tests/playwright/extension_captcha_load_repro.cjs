#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const { createRequire } = require("node:module");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { execSync } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  try {
    const globalNodeModules = execSync("npm root -g", { encoding: "utf8" }).trim();
    const globalRequire = createRequire(path.join(globalNodeModules, "noop.js"));
    ({ chromium } = globalRequire("playwright"));
  } catch {
    console.error(
      "Playwright is required. Install it globally:\n" +
        "  npm install -g playwright\n" +
      "  node load-tests/playwright/extension_captcha_load_repro.cjs",
    );
    throw error;
  }
}

const rootDir = path.resolve(__dirname, "..", "..");
const artifactsDir = path.join(__dirname, "artifacts");
const extensionDist = path.resolve(
  process.env.EOPP_EXTENSION_DIST || path.join(rootDir, "extension", "dist"),
);
const workDir = path.resolve(
  process.env.EOPP_EXTENSION_LOAD_WORKDIR ||
    path.join(artifactsDir, "extension-load-repro"),
);
const serverUrl = (process.env.EOPP_EXTENSION_LOAD_SERVER || "http://127.0.0.1:8766").replace(
  /\/+$/,
  "",
);
const browserCount = Number(process.env.EOPP_EXTENSION_LOAD_BROWSERS || 7);
const rounds = Number(process.env.EOPP_EXTENSION_LOAD_ROUNDS || 20);
const requestPattern = (process.env.EOPP_EXTENSION_LOAD_PATTERN || "2,2,2,2,1,1,1")
  .split(",")
  .map((value) => Math.max(1, Number(value.trim()) || 1));
const mockDelayMs = Number(process.env.EOPP_EXTENSION_LOAD_MOCK_DELAY_MS || 25);
const useMockServer = process.env.EOPP_EXTENSION_LOAD_MOCK_SERVER !== "0";
const headless = process.env.EOPP_EXTENSION_LOAD_HEADLESS === "1";

function copyDir(src, dest) {
  fs.rmSync(dest, { force: true, recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function prepareDiagnosticExtension() {
  if (!fs.existsSync(path.join(extensionDist, "manifest.json"))) {
    throw new Error(`Build extension first: missing ${path.join(extensionDist, "manifest.json")}`);
  }

  const extensionDir = path.join(workDir, "extension");
  copyDir(extensionDist, extensionDir);

  const diagnosticScript = `
(() => {
  const SOURCE = "eopp-extension-load-harness";
  const READY = "eopp-extension-load-ready";
  const RESULT = "eopp-extension-load-result";
  if (window.__EOPP_EXTENSION_LOAD_HARNESS__) return;
  window.__EOPP_EXTENSION_LOAD_HARNESS__ = true;

  const stalls = [];
  let lastFrame = performance.now();
  function frame(now) {
    const gap = now - lastFrame;
    if (gap > 100) stalls.push(gap);
    lastFrame = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.postMessage({
    source: READY,
    href: window.location.href,
  }, window.location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.source === SOURCE && data.action === "ping") {
      window.postMessage({
        source: READY,
        href: window.location.href,
      }, window.location.origin);
      return;
    }
    if (data.source !== SOURCE || data.action !== "solveCaptcha") return;

    const startedAt = performance.now();
    const port = chrome.runtime.connect({ name: "load-solve-" + data.id });
    let responded = false;
    const timeout = setTimeout(() => {
      if (responded) return;
      responded = true;
      try { port.disconnect(); } catch {}
      window.postMessage({
        source: RESULT,
        id: data.id,
        ok: false,
        elapsedMs: performance.now() - startedAt,
        error: "timeout waiting for background response",
        maxFrameGapMs: Math.max(0, ...stalls),
        stallCount: stalls.length,
      }, window.location.origin);
    }, data.timeoutMs || 20000);

    port.onMessage.addListener((response) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      try { port.disconnect(); } catch {}
      window.postMessage({
        source: RESULT,
        id: data.id,
        ok: !!response?.ok,
        elapsedMs: performance.now() - startedAt,
        response,
        maxFrameGapMs: Math.max(0, ...stalls),
        stallCount: stalls.length,
      }, window.location.origin);
    });

    port.onDisconnect.addListener(() => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      window.postMessage({
        source: RESULT,
        id: data.id,
        ok: false,
        elapsedMs: performance.now() - startedAt,
        error: "port disconnected before response",
        maxFrameGapMs: Math.max(0, ...stalls),
        stallCount: stalls.length,
      }, window.location.origin);
    });

    port.postMessage({
      action: "solveCaptcha",
      payload: data.payload,
      serverUrl: data.serverUrl,
    });
  });
})();
`;
  fs.writeFileSync(path.join(extensionDir, "diagnostic-content.js"), diagnosticScript);

  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.content_scripts = manifest.content_scripts || [];
  manifest.content_scripts.push({
    matches: ["http://127.0.0.1:8766/*", "http://localhost:8766/*"],
    js: ["diagnostic-content.js"],
    run_at: "document_start",
  });
  manifest.web_accessible_resources = manifest.web_accessible_resources || [];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return extensionDir;
}

function startMockServer() {
  const parsed = new URL(serverUrl);
  const server = http.createServer((request, response) => {
    if (request.method === "POST" && request.url === "/solve-captcha") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch {}
        setTimeout(() => {
          const captchaId =
            payload.reservation_id || payload.captcha_id || `mock-${Date.now()}-${Math.random()}`;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              variantIndex: 0,
              variantTiles: ["tile-0"],
              captcha_id: captchaId,
              usage_log_id: Math.floor(Math.random() * 1_000_000),
              solved_by_super: false,
              solver_label: "extension-load-mock",
            }),
          );
        }, mockDelayMs);
      });
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>EOPP extension load</title></head>" +
        "<body><main id=\"app\">extension load page</main></body></html>",
    );
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(parsed.port || 80), parsed.hostname, () => resolve(server));
  });
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil((pct / 100) * ordered.length) - 1));
  return ordered[index];
}

function summarize(label, values) {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    label,
    count: values.length,
    avg_ms: values.length ? sum / values.length : 0,
    p50_ms: percentile(values, 50),
    p95_ms: percentile(values, 95),
    p99_ms: percentile(values, 99),
    max_ms: values.length ? Math.max(...values) : 0,
  };
}

async function runOne(page, id) {
  return page.evaluate(
    ({ id: requestId, serverUrl: targetServerUrl }) =>
      new Promise((resolve) => {
        const source = "eopp-extension-load-harness";
        const resultSource = "eopp-extension-load-result";
        const timeout = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve({
            id: requestId,
            ok: false,
            elapsedMs: 20000,
            error: "page timeout waiting for diagnostic content script",
          });
        }, 21000);

        function onMessage(event) {
          const data = event.data || {};
          if (event.source !== window || data.source !== resultSource || data.id !== requestId) {
            return;
          }
          clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve(data);
        }

        window.addEventListener("message", onMessage);
        window.postMessage(
          {
            source,
            action: "solveCaptcha",
            id: requestId,
            serverUrl: targetServerUrl,
            timeoutMs: 20000,
            payload: {
              api_key: "extension-load-key",
              reservation_id: requestId,
              auto_solve: false,
              timeout_metadata: true,
              puzzle: {
                tiles: [{ tileId: "tile-0", imageData: "mock" }],
                variantsCapture: [["tile-0"], ["tile-0"]],
              },
            },
          },
          window.location.origin,
        );
      }),
    { id, serverUrl },
  );
}

async function waitForDiagnosticContent(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const readySource = "eopp-extension-load-ready";
        const source = "eopp-extension-load-harness";
        const timeout = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve(false);
        }, 10000);

        function onMessage(event) {
          const data = event.data || {};
          if (event.source !== window || data.source !== readySource) {
            return;
          }
          clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve(true);
        }

        window.addEventListener("message", onMessage);
        window.postMessage({ source, action: "ping" }, window.location.origin);
      }),
    null,
  ).then((ready) => {
    if (!ready) {
      throw new Error("Diagnostic extension content script did not report ready");
    }
  });
}

async function main() {
  fs.mkdirSync(workDir, { recursive: true });
  const extensionDir = prepareDiagnosticExtension();
  const mockServer = useMockServer ? await startMockServer() : null;
  const contexts = [];
  const consoleErrors = [];
  const requestFailures = [];
  const results = [];

  try {
    for (let index = 0; index < browserCount; index += 1) {
      const userDataDir = path.join(workDir, `profile-${index}`);
      fs.rmSync(userDataDir, { force: true, recursive: true });
      const context = await chromium.launchPersistentContext(userDataDir, {
        headless,
        args: [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--no-first-run",
        ],
      });
      contexts.push(context);
      const page = context.pages()[0] || (await context.newPage());
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          consoleErrors.push({ browser: index, type: message.type(), text: message.text() });
        }
      });
      page.on("requestfailed", (request) => {
        requestFailures.push({
          browser: index,
          url: request.url(),
          failure: request.failure()?.errorText,
        });
      });
      await page.goto(`${serverUrl}/load-${index}/edit`, { waitUntil: "domcontentloaded" });
      await waitForDiagnosticContent(page);
    }

    const pages = contexts.map((context) => context.pages()[0]);
    const startedAt = performance.now();
    for (let round = 0; round < rounds; round += 1) {
      const requests = [];
      for (let browser = 0; browser < pages.length; browser += 1) {
        const count = requestPattern[browser] || 1;
        for (let slot = 0; slot < count; slot += 1) {
          requests.push(runOne(pages[browser], `round-${round}-browser-${browser}-slot-${slot}`));
        }
      }
      results.push(...(await Promise.all(requests)));
    }
    const elapsedMs = performance.now() - startedAt;

    const ok = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const latencies = ok.map((result) => Number(result.elapsedMs || 0));
    const frameGaps = results.map((result) => Number(result.maxFrameGapMs || 0));
    const summary = {
      browsers: browserCount,
      rounds,
      request_pattern: requestPattern,
      total_requests: results.length,
      ok: ok.length,
      failed: failed.length,
      elapsed_ms: elapsedMs,
      latency: summarize("content->background->solveCaptcha", latencies),
      max_frame_gap_ms: frameGaps.length ? Math.max(...frameGaps) : 0,
      console_errors: consoleErrors.slice(0, 20),
      console_error_count: consoleErrors.length,
      request_failures: requestFailures.slice(0, 20),
      request_failure_count: requestFailures.length,
      failures: failed.slice(0, 20),
    };

    console.log(JSON.stringify(summary, null, 2));
    if (failed.length > 0 || requestFailures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
