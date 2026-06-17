# Playwright Load Harnesses

This folder keeps browser-driven load repro scripts and their local artifacts
together. Runtime browser profiles, generated diagnostic extensions, traces, and
other temporary files should go under `artifacts/`.

Install Playwright once:

```powershell
npm install -g playwright
```

Build and start the production-like local app:

```powershell
make run-prod-start
```

Run the solo frontend/SSE icon-click captcha repro. It uses
`server/data/api_keys.db -> captcha_files` as the index and only sends real
payloads whose JSON contains `puzzle.imageBase64` and `puzzle.iconsBase64`:

```powershell
$env:EOPP_SOLO_FRONTEND_ROUNDS='10'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
```

The solo repro caches its test users, API keys, and auth cookies under
`load-tests/playwright/artifacts/solo-frontend-freeze-repro/` so repeated runs
do not log in again while `/api/auth/me` still accepts the cookie. To force a fresh
login/cache refresh:

The solve delay is fixed and shared by every browser. It defaults to `0ms` so
latency checks measure the frontend/backend path, not harness sleep time. Set
`EOPP_SOLO_FRONTEND_SOLVE_DELAY_MS` when a deliberate operator pause is needed.
The delay between icon clicks is fixed at `1000ms` by default; override it with
`EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS`.

To imitate one scheduled worker submitting several captchas at once to the
same user, keep `BROWSERS=1` and increase `CAPTCHAS_PER_BROWSER`. The harness
sends those `/api/solve-captcha` requests concurrently, then solves the frontend
queue one active captcha at a time:

```powershell
$env:EOPP_SOLO_FRONTEND_BROWSERS='1'
$env:EOPP_SOLO_FRONTEND_ROUNDS='1'
$env:EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER='3'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
```

```powershell
$env:EOPP_SOLO_FRONTEND_REFRESH_AUTH='1'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
Remove-Item Env:\EOPP_SOLO_FRONTEND_REFRESH_AUTH
```

Run the extension transport repro:

```powershell
$env:EOPP_EXTENSION_LOAD_ROUNDS='100'
node load-tests/playwright/extension_captcha_load_repro.cjs
```

Useful artifact overrides:

```powershell
$env:EOPP_SOLO_FRONTEND_WORKDIR='D:\tmp\eopp-solo-load'
$env:EOPP_EXTENSION_LOAD_WORKDIR='D:\tmp\eopp-extension-load'
$env:EOPP_SOLO_FRONTEND_CAPTCHA_DB='D:\Projects\eopp\server\data\api_keys.db'
$env:EOPP_SOLO_FRONTEND_CAPTCHA_DIR='D:\Projects\eopp\server\data\captcha_examples\all'
```

Run a one-browser smoke against the legacy production frontend without session
login. Provide a dedicated test API key through the environment; do not commit
real keys:

```powershell
$env:EOPP_SOLO_FRONTEND_BASE_URL='https://45.12.75.110'
$env:EOPP_SOLO_FRONTEND_AUTH_MODE='api-key-only'
$env:EOPP_SOLO_FRONTEND_API_KEYS='<test-api-key>'
$env:EOPP_SOLO_FRONTEND_BROWSERS='1'
$env:EOPP_SOLO_FRONTEND_ROUNDS='1'
$env:EOPP_SOLO_FRONTEND_IGNORE_HTTPS_ERRORS='1'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
```
