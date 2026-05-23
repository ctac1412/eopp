# === Server ===

run-dev: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0 --no-ssl --data-dir data --port 8766

run-prod: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0 --no-ssl --data-dir prod/data --port 8766

run-prod-start: build-frontend build-extension
	@powershell -Command "$$root = (Get-Location).Path; $$pidFile = Join-Path $$root '.run-prod.pid'; $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$listener.OwningProcess | Set-Content -Path $$pidFile -Encoding ascii; Write-Host ('run-prod already running, PID=' + $$listener.OwningProcess); exit 0 }; Start-Process -FilePath 'uv' -ArgumentList 'run','python','manage.py','--host','0.0.0.0','--no-ssl','--data-dir','prod/data','--port','8766' -WorkingDirectory $$root -WindowStyle Hidden; $$serverPid = $$null; for ($$i = 0; $$i -lt 20; $$i++) { Start-Sleep -Milliseconds 250; $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$serverPid = $$listener.OwningProcess; break } }; if (!$$serverPid) { Write-Error 'run-prod failed to start (port 8766 not listening)'; exit 1 }; $$serverPid | Set-Content -Path $$pidFile -Encoding ascii; Write-Host ('run-prod started, PID=' + $$serverPid + ', pidfile=' + $$pidFile)"

run-prod-stop:
	@powershell -Command "$$root = (Get-Location).Path; $$pidFile = Join-Path $$root '.run-prod.pid'; $$targetPid = $$null; if (Test-Path $$pidFile) { $$targetPid = Get-Content $$pidFile -ErrorAction SilentlyContinue }; if (!$$targetPid) { $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$targetPid = $$listener.OwningProcess } }; if (!$$targetPid) { Remove-Item -Force $$pidFile -ErrorAction SilentlyContinue; Write-Host 'run-prod is not running'; exit 0 }; $$stopped = $$false; try { Stop-Process -Id ([int]$$targetPid) -Force -ErrorAction Stop; Write-Host ('run-prod stopped, PID=' + $$targetPid); $$stopped = $$true } catch { $$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$listener) { $$listenerPid = [int]$$listener.OwningProcess; Stop-Process -Id $$listenerPid -Force -ErrorAction SilentlyContinue; Write-Host ('run-prod stopped by port, PID=' + $$listenerPid); $$stopped = $$true } }; if (!$$stopped) { Write-Host ('run-prod process not found, PID=' + $$targetPid) }; Remove-Item -Force $$pidFile -ErrorAction SilentlyContinue; exit 0"

run-prod-restart: run-prod-stop run-prod-start

# === Frontend ===

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

dev-frontend:
	cd frontend && npm run dev

# === Extension ===

install-extension:
	cd yandex-browser-plugin && npm install

build-extension:
	cd yandex-browser-plugin && npm run build

build-extension-dev:
	cd yandex-browser-plugin && DEV_BUILD=true npm run build

typecheck-extension:
	cd yandex-browser-plugin && npm run typecheck

build-crx: typecheck-extension build-extension
	@echo "Packing extension to CRX..."
	@"C:\Users\BAZA\AppData\Local\Yandex\YandexBrowser\Application\browser.exe" --pack-extension="$(CURDIR)/yandex-browser-plugin/dist" --no-sandbox --pack-extension-key="$(CURDIR)/data/my.pem"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; Move-Item -Force '$(CURDIR)/yandex-browser-plugin/dist.crx' -Destination ('$(CURDIR)/plugins/my-helper-v' + $$ver + '.crx'); if (Test-Path '$(CURDIR)/yandex-browser-plugin/dist.crx') { Remove-Item -Force '$(CURDIR)/yandex-browser-plugin/dist.crx' }; Write-Host ('CRX created: plugins/my-helper-v' + $$ver + '.crx')"
	@powershell -Command "$$envFile = '$(CURDIR)/prod/.env.server'; $$serverUrl = 'https://localhost:8765'; if (Test-Path $$envFile) { Get-Content $$envFile | ForEach-Object { if ($$_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$$') { $$serverUrl = $$matches[1].Trim() } } }; $$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; $$codebase = $$serverUrl.TrimEnd('/') + '/plugins/my-helper-v' + $$ver + '.crx'; ('<?xml version=\"1.0\" encoding=\"UTF-8\"?>' + [Environment]::NewLine + '<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">' + [Environment]::NewLine + '  <app appid=\"hoammcmegehdaaiiegpchhlaiiabbhli\">' + [Environment]::NewLine + ('    <updatecheck codebase=\"' + $$codebase + '\" version=\"' + $$ver + '\" />') + [Environment]::NewLine + '  </app>' + [Environment]::NewLine + '</gupdate>') | Set-Content '$(CURDIR)/plugins/update.xml' -Encoding UTF8; Write-Host ('update.xml updated to v' + $$ver + ' at ' + $$codebase)"

# === Formatters ===

install-formatters:
	uv pip install black ruff
	cd frontend && npm install

format: format-py format-js

format-py:
	uv run black .
	uv run ruff check --fix .

format-js:
	cd frontend && npm run format

format-check-py:
	uv run black --check .
	uv run ruff check .

format-check-js:
	cd frontend && npm run format:check

# === Utils ===

bench:
	uv run pytest tests/test_solve_captcha.py -v -s

list-plugins:
	@echo "Plugin versions:"
	@python -c "from src.plugins import get_versions; [print(f\"  {v['version']} - {v.get('note', '')}\") for v in get_versions()]"

# === Deploy ===

deploy-preflight:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/preflight.ps1"

deploy:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/deploy.ps1"

deploy-backup:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/backup.ps1"

deploy-pull-data:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/pull-data.ps1"

deploy-push-data:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/push-data.ps1"

deploy-push-plugins:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/push-plugins.ps1"

deploy-logs:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/logs.ps1"

deploy-rollback:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/rollback.ps1"

deploy-ssl-staging:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/setup-ssl-ip.ps1" -Staging

deploy-ssl:
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy/setup-ssl-ip.ps1"

# === Migrations ===

migrate:
	uv run python -m alembic upgrade head

migrate-status:
	uv run python -m alembic current

migrate-history:
	uv run python -m alembic history --verbose

migration:
	uv run python -m alembic revision -m "$(MSG)"

migrate-downgrade:
	uv run python -m alembic downgrade -1

migrate-downgrade-all:
	uv run python -m alembic downgrade base
