"""
EOPP Captcha Solver - Admin Routes

Админские эндпоинты:
- POST /admin/auth - аутентификация админа
- GET /admin/streams - список активных SSE соединений
- GET /admin/test-stats - статистика по тестовым кейсам
- GET /admin/benchmark - запуск бенчмарка решателя

Защита: требует X-Admin-Token в заголовках (ADMIN_TOKEN)
"""

from fastapi.responses import JSONResponse

from src.constants import ADMIN_TOKEN, PROTECTED_PATHS
from src.models import AdminAuthBody
from src.utils import (
    get_connected_streams,
    get_test_stats,
    run_benchmark_cached,
)


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in PROTECTED_PATHS):
            token = request.headers.get("X-Admin-Token")
            if not token or token != ADMIN_TOKEN:
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        response = await call_next(request)
        return response

    return admin_auth_middleware


def register_admin_routes(app):
    @app.post("/admin/auth")
    async def admin_auth(body: AdminAuthBody):
        if body.token == ADMIN_TOKEN:
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    @app.get("/admin/streams")
    async def admin_streams():
        return JSONResponse(content=get_connected_streams())

    @app.get("/admin/test-stats")
    async def admin_test_stats():
        return JSONResponse(content=get_test_stats())

    @app.get("/admin/benchmark")
    async def admin_benchmark():
        return JSONResponse(content=run_benchmark_cached())
