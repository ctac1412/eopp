"""
EOPP Captcha Solver - FastAPI Application Factory.

Создание и конфигурация FastAPI приложения. Настраивает:
- CORS для всех origins
- Admin auth middleware
- Lifespan контекст для тестов/разметки
- Регистрацию всех роутов

Используется manage.py для создания приложения и запуска uvicorn.
"""

import threading
import webbrowser
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.constants import (
    CAPTCHA_TIMEOUT,
    PORT,
)
from src.routes import register_all_routes
from src.routes.admin import admin_auth_middleware_factory
from src.utils import (
    lock,
    pending,
    send_test_cases,
    send_write_cases,
)


def create_app(
    use_tests: bool = False, write_mode: bool = False, captcha_timeout=CAPTCHA_TIMEOUT
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if use_tests:
            t = threading.Thread(target=send_test_cases, daemon=True)
            t.start()
        if write_mode:
            t = threading.Thread(target=send_write_cases, daemon=True)
            t.start()
        from src import constants

        protocol = "https" if constants.use_ssl else "http"
        webbrowser.open(f"{protocol}://127.0.0.1:{PORT}")
        yield
        with lock:
            for entry in pending.values():
                entry["event"].set()
        pending.clear()

    if write_mode:
        captcha_timeout = 99

    app = FastAPI(lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    admin_auth_middleware_factory(app)
    register_all_routes(app, captcha_timeout)

    return app
