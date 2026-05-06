FROM python:3.13-slim AS builder

RUN pip install uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv

COPY . .

RUN mkdir -p data certs

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV EOPP_DB_PATH=/app/data/api_keys.db

EXPOSE 8765

CMD ["python", "manage.py", "--host", "0.0.0.0"]