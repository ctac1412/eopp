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
