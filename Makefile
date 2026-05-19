# === Server ===

run-dev: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0 --no-ssl --data-dir data --port 8766

run-prod: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0 --no-ssl --data-dir prod/data --port 8766

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

build-crx: build-extension
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
