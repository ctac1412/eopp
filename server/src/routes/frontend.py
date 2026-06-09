"""
EOPP Captcha Solver - Frontend Routes

Эндпоинты раздачи статики:
- GET /{path} - раздача React SPA из frontend/dist/
- GET /test-injector/* - тестовые страницы
"""

import os

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from src.constants import FRONTEND_DIST

frontend_router = APIRouter(tags=["frontend"])
test_router = APIRouter(prefix="/test-injector", tags=["test"])

TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }}
    .card {{ background: #fff; border-radius: 12px; padding: 40px 48px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }}
    h1 {{ margin: 0 0 12px; font-size: 22px; }}
    p {{ color: #666; margin: 0; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p>Тестовая страница для инжектора. Нажмите кнопку «Инжектор».</p>
  </div>
</body>
</html>"""

VARIANTS = {
    1: "АПП Забайкальск (Cargo, vehicle-1)",
    2: "АПП Забайкальск (Cargo, vehicle-2)",
    3: "АПП Забайкальск (Special, vehicle-3)",
    4: "АПП Забайкальск (Cargo, vehicle-4)",
}


def register_frontend_routes(app):
    if os.path.isdir(FRONTEND_DIST):
        @frontend_router.get("/{full_path:path}")
        async def serve_frontend(full_path: str = ""):
            if not full_path:
                full_path = "index.html"
            file_path = os.path.join(FRONTEND_DIST, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
    else:
        @frontend_router.get("/{full_path:path}")
        async def serve_frontend_fallback(full_path: str = ""):
            index_path = os.path.join(FRONTEND_DIST, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return JSONResponse(
                status_code=503,
                content={"error": "Frontend not built. Run: make build-frontend"},
            )

    app.include_router(frontend_router)


def register_test_pages(app):
    @test_router.get("/edit")
    async def test_injector_edit():
        return HTMLResponse(TEST_PAGE_HTML.format(title="Тест: Создание брони"))

    @test_router.get("/reschedule")
    async def test_injector_reschedule():
        return HTMLResponse(TEST_PAGE_HTML.format(title="Тест: Перенос брони"))

    @test_router.get("/edit/{variant}")
    async def test_injector_edit_variant(variant: int):
        label = VARIANTS.get(variant, f"Вариант {variant}")
        return HTMLResponse(TEST_PAGE_HTML.format(title=f"Тест: Создание брони — {label}"))

    @test_router.get("/reschedule/{variant}")
    async def test_injector_reschedule_variant(variant: int):
        label = VARIANTS.get(variant, f"Вариант {variant}")
        return HTMLResponse(TEST_PAGE_HTML.format(title=f"Тест: Перенос брони — {label}"))

    app.include_router(test_router)
