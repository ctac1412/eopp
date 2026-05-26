"""
EOPP Captcha Solver - FastAPI Application Factory.

Создание и конфигурация FastAPI приложения. Настраивает:
- CORS для всех origins
- Логирование всех запросов
- Admin auth middleware
- Lifespan контекст для тестов/разметки
- Регистрацию всех роутов

Используется manage.py для создания приложения и запуска uvicorn.
"""

import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from src.constants import (
    CAPTCHA_TIMEOUT,
)
from src.db import init_db
from src.routes import register_all_routes
from src.routes.admin import admin_auth_middleware_factory
from src.services import telegram_service
from src.sse import lock, pending

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("eopp")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        response = await call_next(request)

        duration = (time.time() - start_time) * 1000
        logger.info(
            f"{request.method} {request.url.path} - {response.status_code} - {duration:.1f}ms"
        )

        return response


def create_app(captcha_timeout=CAPTCHA_TIMEOUT) -> FastAPI:
    init_db()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        telegram_stop = threading.Event()
        telegram_thread = telegram_service.start_daily_report_scheduler(telegram_stop)
        yield
        if telegram_thread:
            telegram_stop.set()
        with lock:
            for entry in pending.values():
                entry["event"].set()
        pending.clear()

    app = FastAPI(lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(RequestLoggingMiddleware)

    admin_auth_middleware_factory(app)
    register_all_routes(app, captcha_timeout)

    return app
