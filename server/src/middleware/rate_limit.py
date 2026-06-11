"""In-memory rate limiter middleware.

Simple sliding-window rate limiter per IP/endpoint.
Controlled via env:
  EOPP_RATE_LIMIT_CAPTCHA — max requests per minute for /solve-captcha (default: 30)
  EOPP_RATE_LIMIT_VALIDATE — max requests per minute for /validate-key (default: 10)
"""

import time
import os
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._window = 60.0
        self._limits = {
            "/solve-captcha": int(os.environ.get("EOPP_RATE_LIMIT_CAPTCHA", "30")),
            "/validate-key": int(os.environ.get("EOPP_RATE_LIMIT_VALIDATE", "10")),
        }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        max_requests = self._limits.get(path)
        if max_requests is None:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"{client_ip}:{path}"
        now = time.time()

        bucket = self._buckets[key]
        bucket[:] = [t for t in bucket if now - t < self._window]

        if len(bucket) >= max_requests:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded", "retry_after": 60},
            )

        bucket.append(now)
        return await call_next(request)
