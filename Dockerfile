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

ARG EOPP_GIT_SHA=unknown
ARG EOPP_RELEASE_ID=local
ARG EOPP_IMAGE=eopp:local

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
ENV EOPP_GIT_SHA=$EOPP_GIT_SHA
ENV EOPP_RELEASE_ID=$EOPP_RELEASE_ID
ENV EOPP_IMAGE=$EOPP_IMAGE

LABEL org.opencontainers.image.revision="$EOPP_GIT_SHA" \
      org.opencontainers.image.version="$EOPP_RELEASE_ID" \
      org.opencontainers.image.ref.name="$EOPP_IMAGE"

EXPOSE 8765

CMD ["python", "server/manage.py", "--host", "0.0.0.0"]
