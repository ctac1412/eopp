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
	@"C:\Users\BAZA\AppData\Local\Yandex\YandexBrowser\Application\browser.exe" --pack-extension="$(CURDIR)/yandex-browser-plugin/dist" --no-sandbox --pack-extension-key="$(CURDIR)/data/eopp-injector.pem"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; Move-Item -Force '$(CURDIR)/yandex-browser-plugin/dist.crx' -Destination ('$(CURDIR)/plugins/eopp-injector-v' + $$ver + '.crx'); Write-Host ('CRX created: plugins/eopp-injector-v' + $$ver + '.crx')"
	@powershell -Command "$$ver = (Get-Content '$(CURDIR)/yandex-browser-plugin/dist/manifest.json' | ConvertFrom-Json).version; ('<?xml version=\"1.0\" encoding=\"UTF-8\"?>' + [Environment]::NewLine + '<gupdate xmlns=\"http://www.google.com/update2/response\" protocol=\"2.0\">' + [Environment]::NewLine + '  <app appid=\"ahmfeapbinmljhcpbefdpnhbhmnlback\">' + [Environment]::NewLine + '    <updatecheck codebase=\"https://china.alabai.netcraze.pro/plugins/eopp-injector-v' + $$ver + '.crx\" version=\"' + $$ver + '\" />' + [Environment]::NewLine + '  </app>' + [Environment]::NewLine + '</gupdate>') | Set-Content '$(CURDIR)/plugins/update.xml' -Encoding UTF8; Write-Host ('update.xml updated to v' + $$ver)"

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
