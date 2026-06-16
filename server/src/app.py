"""
EOPP Captcha Solver - FastAPI Application Factory.

Создание и конфигурация FastAPI приложения. Настраивает:
- CORS для всех origins
- Логирование всех запросов
- Admin auth middleware
- Lifespan контекст для тестов/разметки
- Регистрацию всех роутов через APIRouter

Используется manage.py для создания приложения и запуска uvicorn.
"""

import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from src.db import init_db
from src.logging_config import configure_logging
from src.routes import register_all_routes
from src.services import telegram_service
from src.services.tech_user_bootstrap import ensure_env_tech_user
from src.sse import lock, pending, push_sse

logger = logging.getLogger("eopp")


async def _distribution_cleanup_loop():
    """Periodically clean up expired distribution states (TTL)."""
    from src.routes.distribution import distribution_states

    STATE_TTL = 120  # seconds

    while True:
        await asyncio.sleep(30)
        now = time.time()
        expired = []
        for captcha_id, state in distribution_states.items():
            assigned_at = state.get("icon_assigned_at", {})
            all_answered = len(state.get("all_answers", {})) == state.get("total_icons", 0)
            if not all_answered and assigned_at:
                oldest = min(assigned_at.values())
                if now - oldest > STATE_TTL:
                    expired.append(captcha_id)
        for captcha_id in expired:
            distribution_states.pop(captcha_id, None)
            logger.info("dist_cleanup_expired captcha=%s", captcha_id)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        response = await call_next(request)

        duration = (time.time() - start_time) * 1000
        logger.info(
            f"{request.method} {request.url.path} - {response.status_code} - {duration:.1f}ms"
        )

        return response


def create_app() -> FastAPI:
    init_db()
    ensure_env_tech_user()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        telegram_stop = threading.Event()
        telegram_thread = telegram_service.start_daily_report_scheduler(telegram_stop)
        dist_cleanup_task = asyncio.create_task(_distribution_cleanup_loop())
        yield
        if telegram_thread:
            telegram_stop.set()
        dist_cleanup_task.cancel()
        # Graceful shutdown: notify all pending captchas
        with lock:
            for entry in pending.values():
                if entry.get("result") is None:
                    entry["result"] = {
                        "status": "timeout",
                        "error": "server_shutdown",
                        "usage_log_id": entry.get("usage_log_id"),
                        "captcha_id": entry.get("captcha_id"),
                    }
                entry["event"].set()
                push_sse(
                    {
                        "type": "captcha_timeout",
                        "captcha_id": entry.get("captcha_id"),
                        "owner_api_key_id": entry.get("api_key_id"),
                    },
                    api_key_id=entry.get("api_key_id"),
                )
            pending.clear()

    app = FastAPI(lifespan=lifespan)

    from src.constants import CORS_ORIGINS

    if "*" in CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.add_middleware(RequestLoggingMiddleware)

    register_all_routes(app)

    configure_logging()
    return app
