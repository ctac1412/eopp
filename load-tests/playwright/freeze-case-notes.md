# Icon-Click Freeze Investigation Notes

Date: 2026-06-16

## Goal

Reproduce and isolate the intermittent operator-visible freeze where an
icon-click captcha receives clicks but the frontend does not progress or close
the captcha quickly enough.

## Important Scenarios

Local current branch:

```powershell
$env:EOPP_SOLO_FRONTEND_BASE_URL='http://127.0.0.1:8766'
$env:EOPP_SOLO_FRONTEND_AUTH_MODE='session'
$env:EOPP_SOLO_FRONTEND_BROWSERS='4'
$env:EOPP_SOLO_FRONTEND_ROUNDS='1'
$env:EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER='3'
$env:EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS='1000'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
```

Production session mode through nginx:

```powershell
$env:EOPP_SOLO_FRONTEND_BASE_URL='https://45.12.75.110'
$env:EOPP_SOLO_FRONTEND_AUTH_MODE='session'
$env:EOPP_SOLO_FRONTEND_USER_LOGINS='<login1>,<login2>,<login3>,<login4>'
$env:EOPP_SOLO_FRONTEND_USER_PASSWORDS='<password1>,<password2>,<password3>,<password4>'
$env:EOPP_SOLO_FRONTEND_API_KEYS='<key1>,<key2>,<key3>,<key4>'
$env:EOPP_SOLO_FRONTEND_IGNORE_HTTPS_ERRORS='1'
$env:EOPP_SOLO_FRONTEND_BROWSERS='4'
$env:EOPP_SOLO_FRONTEND_ROUNDS='1'
$env:EOPP_SOLO_FRONTEND_CAPTCHAS_PER_BROWSER='3'
$env:EOPP_SOLO_FRONTEND_OPEN_STAGGER_MS='1500'
$env:EOPP_SOLO_FRONTEND_CLICK_INTERVAL_MS='1000'
node load-tests/playwright/solo_frontend_captcha_freeze_repro.cjs
```

## Observations

- Current local branch did not reproduce the freeze reliably after backend
  restart and repeated `4 browsers x 3 captchas` runs.
- A previous local headed run did reproduce a frontend-side stall: one captcha
  stayed active at `4/5`; no `/solve` request was observed for that captcha.
- The marker overlay was checked and already has `pointer-events: none`, so
  marker interception is not the confirmed root cause.
- Production direct `:8765` should be closed from outside. Nginx proxies
  `443 -> 127.0.0.1:8765`.
- Production nginx has SSE-friendly `/stream` settings:
  `proxy_buffering off`, `proxy_read_timeout 1h`, `proxy_send_timeout 1h`.
- Production uvicorn appears to run as a single app process with
  `limit_concurrency=100` unless `EOPP_CONCURRENCY` is set.
- Local VPN/proxy routing can affect Playwright Chromium: `curl` to `:8765`
  was fast while Chromium sometimes hit `page.goto net::ERR_CONNECTION_TIMED_OUT`.
- Stale Playwright Chromium processes can keep SSE open. Confirm with:

```powershell
curl.exe -k -b cookies.txt -c cookies.txt "https://45.12.75.110/check-stream"
```

If `has_active_stream=true`, the frontend should show the force reconnect
button. The harness now clicks `StatusBarForceReconnectButton` automatically.

## Production Log Clue

Observed production stack trace, not yet correlated to the harness run:

```text
KeyError: 'discontinuity'
server/src/services/captcha_file_service.py
calculate_solver_results()
```

Because surrounding logs included unrelated API-key ids and plugin/usage
traffic, do not attribute this exception to the load test without matching the
test `run_id` / `reservation_id`.

## Harness Requirements Preserved

- Use only real icon-click payloads from local DB-indexed examples.
- Keep runtime artifacts under `load-tests/playwright/artifacts/`.
- Keep production API keys out of committed files.
- Prefer short repros: `4 browsers x 3 captchas` before longer runs.
- Preserve explicit timeouts so failures return JSON summaries instead of
  hanging until an outer shell timeout kills the process.
