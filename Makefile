bench:
	uv run pytest tests/test_solve_captcha.py -v -s

run: build-frontend
	uv run python manage.py --host 0.0.0.0

run-test: build-frontend
	uv run python manage.py --test

run-write: build-frontend
	uv run python manage.py --write

install-frontend:
	cd frontend && npm install

build-frontend:
	cd frontend && npm run build

dev-frontend:
	cd frontend && npm run dev
