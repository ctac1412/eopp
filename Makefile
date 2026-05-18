bench:
	uv run pytest tests/test_solve_captcha.py -v -s

run: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0

run-http: build-frontend
	uv run python manage.py --host 0.0.0.0 --no-ssl

run-test: build-frontend
	uv run python manage.py --test

run-write: build-frontend build-extension
	uv run python manage.py --write

run-dev: build-frontend build-extension
	uv run python manage.py --host 0.0.0.0 --no-ssl --db-path data/api_keys_dev.db --port 8766

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

dev-frontend:
	cd frontend && npm run dev

build-extension:
	cd yandex-browser-plugin && npm run build

build-extension-dev:
	cd yandex-browser-plugin && DEV_BUILD=true npm run build

build-crx: build-extension
	@echo "Packing extension to CRX..."
	@"C:\Users\BAZA\AppData\Local\Yandex\YandexBrowser\Application\browser.exe" --pack-extension="$(CURDIR)/yandex-browser-plugin/dist" --no-sandbox --pack-extension-key="$(CURDIR)/data/my.pem"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; Move-Item -Force '$(CURDIR)/yandex-browser-plugin/dist.crx' -Destination ('$(CURDIR)/plugins/my-helper-v' + $$ver + '.crx'); Write-Host ('CRX created: plugins/my-helper-v' + $$ver + '.crx')"
	@powershell -Command "$$envFile = '$(CURDIR)/.env.server'; $$serverUrl = 'https://localhost:8765'; if (Test-Path $$envFile) { Get-Content $$envFile | ForEach-Object { if ($$_ -match '^\s*SERVER_URL\s*=\s*(.+?)\s*$$') { $$serverUrl = $$matches[1].Trim() } } }; $$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; $$codebase = $$serverUrl.TrimEnd('/') + '/plugins/my-helper-v' + $$ver + '.crx'; ('<?xml version=\"1.0\" encoding=\"UTF-8\"?>' + [Environment]::NewLine + '<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">' + [Environment]::NewLine + '  <app appid=\"hoammcmegehdaaiiegpchhlaiiabbhli\">' + [Environment]::NewLine + ('    <updatecheck codebase=\"' + $$codebase + '\" version=\"' + $$ver + '\" />') + [Environment]::NewLine + '  </app>' + [Environment]::NewLine + '</gupdate>') | Set-Content '$(CURDIR)/plugins/update.xml' -Encoding UTF8; Write-Host ('update.xml updated to v' + $$ver + ' at ' + $$codebase)"

install-extension:
	cd yandex-browser-plugin && npm install

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

# Prod (Docker)
build-prod:
	docker compose build

start-prod:
	docker compose up -d

stop-prod:
	docker compose down

restart-prod: stop-prod start-prod

rebuild-prod:
	docker compose up -d --build
	docker compose logs -f

logs-prod:
	docker compose logs -f

list-plugins:
	@echo "Plugin versions:"
	@python -c "from src.plugins import get_versions; [print(f\"  {v['version']} - {v.get('note', '')}\") for v in get_versions()]"

# Deploy (requires scripts/.env.deploy to be configured)
deploy:                  # Full deploy: build, transfer, run, health-check
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" deploy

deploy-pull-data:        # Download remote data/ to local backups/pulled-data/
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" pull-data

deploy-logs:             # Stream remote container logs in real-time
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" logs

deploy-backup:           # Backup remote data/ and plugins/ to local backups/
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" backup

deploy-rollback:         # Rollback to previous Docker image on remote server
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" rollback

deploy-push-data:        # Push local data/ and plugins/ to remote server
	powershell -ExecutionPolicy Bypass -File "$(CURDIR)/scripts/deploy.ps1" push-data

# Alembic migrations
migrate:                 # Применить все миграции (alembic upgrade head)
	uv run python -m alembic upgrade head

migrate-status:          # Статус миграций
	uv run python -m alembic current

migrate-history:         # История миграций
	uv run python -m alembic history --verbose

migration:               # Создать новую миграцию: make migration MSG="add column"
	uv run python -m alembic revision -m "$(MSG)"

migrate-downgrade:       # Откатить последнюю миграцию
	uv run python -m alembic downgrade -1

migrate-downgrade-all:   # Откатить все миграции
	uv run python -m alembic downgrade base
