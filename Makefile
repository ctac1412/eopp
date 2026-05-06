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

run-dev: build-frontend
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

# Plugin versioning
build-plugin: build-extension
	@echo "Building plugin with version bump..."
	@python scripts/bump_plugin_version.py

build-plugin-no-bump: build-extension
	@echo "Building plugin without version bump..."
	@python scripts/copy_plugin_to_plugins.py

list-plugins:
	@echo "Plugin versions:"
	@python -c "from src.plugins import get_versions; [print(f\"  {v['version']} - {v.get('note', '')}\") for v in get_versions()]"
