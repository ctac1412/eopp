# === Server ===

run-prod: build-frontend build-extension build-channel-extension
	uv run python server/manage.py --host 0.0.0.0 --no-ssl --data-dir server/data --port 8766

run-prod-start: build-frontend build-extension build-channel-extension
	@powershell -Command "$$root = (Get-Location).Path; $$pidFile = Join-Path $$root '.run-prod.pid'; $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$listener.OwningProcess | Set-Content -Path $$pidFile -Encoding ascii; Write-Host ('run-prod already running, PID=' + $$listener.OwningProcess); exit 0 }; Start-Process -FilePath 'uv' -ArgumentList 'run','python','server/manage.py','--host','0.0.0.0','--no-ssl','--data-dir','server/data','--port','8766' -WorkingDirectory $$root -WindowStyle Hidden; $$serverPid = $$null; for ($$i = 0; $$i -lt 20; $$i++) { Start-Sleep -Milliseconds 250; $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$serverPid = $$listener.OwningProcess; break } }; if (!$$serverPid) { Write-Error 'run-prod failed to start (port 8766 not listening)'; exit 1 }; $$serverPid | Set-Content -Path $$pidFile -Encoding ascii; Write-Host ('run-prod started, PID=' + $$serverPid + ', pidfile=' + $$pidFile)"

run-prod-stop:
	@powershell -Command "$$root = (Get-Location).Path; $$pidFile = Join-Path $$root '.run-prod.pid'; $$targetPid = $$null; if (Test-Path $$pidFile) { $$targetPid = Get-Content $$pidFile -ErrorAction SilentlyContinue }; if (!$$targetPid) { $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$targetPid = $$listener.OwningProcess } }; if (!$$targetPid) { Remove-Item -Force $$pidFile -ErrorAction SilentlyContinue; Write-Host 'run-prod is not running'; exit 0 }; $$stopped = $$false; try { Stop-Process -Id ([int]$$targetPid) -Force -ErrorAction Stop; Write-Host ('run-prod stopped, PID=' + $$targetPid); $$stopped = $$true } catch { $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$listenerPid = [int]$$listener.OwningProcess; Stop-Process -Id $$listenerPid -Force -ErrorAction SilentlyContinue; Write-Host ('run-prod stopped by port, PID=' + $$listenerPid); $$stopped = $$true } }; if (!$$stopped) { Write-Host ('run-prod process not found, PID=' + $$targetPid) }; Remove-Item -Force $$pidFile -ErrorAction SilentlyContinue; exit 0"

run-prod-restart: run-prod-stop run-prod-start

docker-build:
	docker compose build eopp-prod

# === Frontend ===

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

dev-frontend:
	cd frontend && npm run dev

# === Extension ===

install-extension:
	cd extension && npm install

build-extension:
	cd extension && npm run build

build-extension-dev:
	cd extension && DEV_BUILD=true npm run build

typecheck-extension:
	cd extension && npm run typecheck

install-channel-extension:
	cd channel-extension && npm install

build-channel-extension:
	cd channel-extension && npm run build

build-channel-extension-dev:
	cd channel-extension && DEV_BUILD=true npm run build

typecheck-channel-extension:
	cd channel-extension && npm run typecheck

build-channel-crx: typecheck-channel-extension build-channel-extension
	@echo "Packing channel extension to CRX..."
	@powershell -Command "New-Item -ItemType Directory -Force -Path '$(CURDIR)/plugins/channel' | Out-Null"
	@"C:\Program Files\Yandex\YandexBrowser\Application\browser.exe" --pack-extension="$(CURDIR)/channel-extension/dist" --no-sandbox --pack-extension-key="$(CURDIR)/extension/my.pem"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/channel-extension/dist/manifest.json' | ConvertFrom-Json).version; Move-Item -Force '$(CURDIR)/channel-extension/dist.crx' -Destination ('$(CURDIR)/plugins/channel/eopp-channel-v' + $$ver + '.crx'); if (Test-Path '$(CURDIR)/channel-extension/dist.crx') { Remove-Item -Force '$(CURDIR)/channel-extension/dist.crx' }; Write-Host ('CRX created: plugins/channel/eopp-channel-v' + $$ver + '.crx')"
	@powershell -Command "$$envFile = '$(CURDIR)/server/deploy/.env.server'; $$serverUrl = 'https://localhost:8765'; if (Test-Path $$envFile) { Get-Content $$envFile | ForEach-Object { if ($$_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$$') { $$serverUrl = $$matches[1].Trim() } } }; try { $$uri = [Uri]$$serverUrl; $$host = $$uri.Host.ToLower(); $$isLocal = ($$host -eq 'localhost' -or $$host -eq '127.0.0.1' -or $$host -eq '::1'); if (-not $$isLocal -and $$uri.Scheme -eq 'http') { $$builder = New-Object System.UriBuilder($$uri); $$builder.Scheme = 'https'; if ($$builder.Port -eq 80) { $$builder.Port = -1 }; $$serverUrl = $$builder.Uri.AbsoluteUri.TrimEnd('/') } else { $$serverUrl = $$serverUrl.TrimEnd('/') } } catch { $$serverUrl = $$serverUrl.TrimEnd('/') }; $$ver = (Get-Content '$(CURDIR)/channel-extension/dist/manifest.json' | ConvertFrom-Json).version; $$codebase = $$serverUrl + '/plugins/channel/eopp-channel-v' + $$ver + '.crx'; ('<?xml version=\"1.0\" encoding=\"UTF-8\"?>' + [Environment]::NewLine + '<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">' + [Environment]::NewLine + '  <app appid=\"hoammcmegehdaaiiegpchhlaiiabbhli\">' + [Environment]::NewLine + ('    <updatecheck codebase=\"' + $$codebase + '\" version=\"' + $$ver + '\" />') + [Environment]::NewLine + '  </app>' + [Environment]::NewLine + '</gupdate>') | Set-Content '$(CURDIR)/plugins/channel/update.xml' -Encoding UTF8; Write-Host ('channel update.xml updated to v' + $$ver + ' at ' + $$codebase)"

build-crx: typecheck-extension build-extension
	@echo "Packing extension to CRX..."
	@"C:\Program Files\Yandex\YandexBrowser\Application\browser.exe" --pack-extension="$(CURDIR)/extension/dist" --no-sandbox --pack-extension-key="$(CURDIR)/extension/my.pem"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/extension/dist/manifest.json' | ConvertFrom-Json).version; Move-Item -Force '$(CURDIR)/extension/dist.crx' -Destination ('$(CURDIR)/plugins/my-helper-v' + $$ver + '.crx'); if (Test-Path '$(CURDIR)/extension/dist.crx') { Remove-Item -Force '$(CURDIR)/extension/dist.crx' }; Write-Host ('CRX created: plugins/my-helper-v' + $$ver + '.crx')"
	@powershell -Command "$$envFile = '$(CURDIR)/server/deploy/.env.server'; $$serverUrl = 'https://localhost:8765'; if (Test-Path $$envFile) { Get-Content $$envFile | ForEach-Object { if ($$_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$$') { $$serverUrl = $$matches[1].Trim() } } }; try { $$uri = [Uri]$$serverUrl; $$host = $$uri.Host.ToLower(); $$isLocal = ($$host -eq 'localhost' -or $$host -eq '127.0.0.1' -or $$host -eq '::1'); if (-not $$isLocal -and $$uri.Scheme -eq 'http') { $$builder = New-Object System.UriBuilder($$uri); $$builder.Scheme = 'https'; if ($$builder.Port -eq 80) { $$builder.Port = -1 }; $$serverUrl = $$builder.Uri.AbsoluteUri.TrimEnd('/') } else { $$serverUrl = $$serverUrl.TrimEnd('/') } } catch { $$serverUrl = $$serverUrl.TrimEnd('/') }; $$ver = (Get-Content '$(CURDIR)/extension/dist/manifest.json' | ConvertFrom-Json).version; $$codebase = $$serverUrl + '/plugins/my-helper-v' + $$ver + '.crx'; ('<?xml version=\"1.0\" encoding=\"UTF-8\"?>' + [Environment]::NewLine + '<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">' + [Environment]::NewLine + '  <app appid=\"hoammcmegehdaaiiegpchhlaiiabbhli\">' + [Environment]::NewLine + ('    <updatecheck codebase=\"' + $$codebase + '\" version=\"' + $$ver + '\" />') + [Environment]::NewLine + '  </app>' + [Environment]::NewLine + '</gupdate>') | Set-Content '$(CURDIR)/plugins/update.xml' -Encoding UTF8; Write-Host ('update.xml updated to v' + $$ver + ' at ' + $$codebase)"

# === Formatters ===

install-formatters:
	uv pip install ruff
	cd frontend && npm install

format: format-py format-js

format-py:
	uv run ruff format .
	uv run ruff check --fix .

format-js:
	cd frontend && npm run format

format-check-py:
	uv run ruff format --check .
	uv run ruff check .

format-check-js:
	cd frontend && npm run format:check

# === Utils ===

bench:
	uv run pytest server/tests/test_solve_captcha.py -v -s

list-plugins:
	@echo "Plugin versions:"
	@PYTHONPATH="$(CURDIR)/server;$$env:PYTHONPATH" uv run python -c "from src.plugins import get_versions; [print(f\"  {v['version']} - {v.get('note', '')}\") for v in get_versions()]"

telegram-daily:
	PYTHONPATH="$(CURDIR)/server;$$env:PYTHONPATH" uv run python -c "from src.services.telegram_service import load_local_env, parse_report_day, send_daily_report_sync; load_local_env(); print('sent=' + str(send_daily_report_sync(parse_report_day('$(DAY)'))))"

telegram-usage:
	@powershell -Command "if ('$(LOG_ID)' -eq '') { Write-Error 'Usage: make telegram-usage LOG_ID=123'; exit 1 }"
	PYTHONPATH="$(CURDIR)/server;$$env:PYTHONPATH" uv run python -c "from src.services.telegram_service import load_local_env, notify_usage_by_id; load_local_env(); print('sent=' + str(notify_usage_by_id(int('$(LOG_ID)'), async_send=False)))"

# === Deploy ===

deploy-preflight:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/preflight.ps1"

deploy:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/deploy.ps1"

deploy-backup:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/backup.ps1"

deploy-pull-data:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/pull-data.ps1"

deploy-pull-data-full:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/pull-data.ps1" -WithExamples

deploy-push-data:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/push-data.ps1"

deploy-push-plugins:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/push-plugins.ps1"

deploy-verify:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/verify-release.ps1"

deploy-migrate:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/migrate.ps1" -ReleaseId "$(RELEASE_ID)" -Image "$(IMAGE)"

deploy-restore-backup:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/restore-backup.ps1" -BackupId "$(BACKUP_ID)"

deploy-logs:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/logs.ps1"

deploy-rollback:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/rollback.ps1" -ReleaseId "$(RELEASE_ID)"

deploy-ssl-staging:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/setup-ssl-ip.ps1" -Staging

deploy-ssl:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/setup-ssl-ip.ps1"

# === Migrations ===

migrate:
	cd server && uv run python -m alembic upgrade head

migrate-status:
	cd server && uv run python -m alembic current

migrate-history:
	cd server && uv run python -m alembic history --verbose

migration:
	cd server && uv run python -m alembic revision -m "$(MSG)"

migrate-downgrade:
	cd server && uv run python -m alembic downgrade -1

migrate-downgrade-all:
	cd server && uv run python -m alembic downgrade base

# === Tests ===

test:
	uv run pytest server/tests/ -v

test-fast:
	uv run pytest server/tests/ -v -x --tb=short
