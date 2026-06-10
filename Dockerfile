FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

WORKDIR /app

COPY pyproject.toml .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --no-dev --no-install-project

COPY . .

RUN mkdir -p data certs

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV EOPP_DB_PATH=/app/data/api_keys.db

EXPOSE 8765

CMD ["python", "server/manage.py", "--host", "0.0.0.0"]
