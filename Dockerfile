FROM python:3.13-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --no-dev --no-install-project

COPY . .

RUN mkdir -p data certs

FROM python:3.13-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/server /app/server
COPY --from=builder /app/scripts /app/scripts
COPY --from=builder /app/pyproject.toml /app/
COPY --from=builder /app/frontend /app/frontend

RUN mkdir -p data certs

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV EOPP_DB_PATH=/app/data/api_keys.db

EXPOSE 8765

CMD ["python", "server/manage.py", "--host", "0.0.0.0"]
