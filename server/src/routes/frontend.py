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
channel_test_router = APIRouter(prefix="/test-channel", tags=["test"])

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

CHANNEL_TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{ margin: 0; background: #eef2f4; color: #172025; font-family: Arial, sans-serif; }}
    header {{ background: #12343b; color: white; padding: 18px 32px; }}
    main {{ max-width: 980px; margin: 28px auto; padding: 0 20px; }}
    .layout {{ display: grid; grid-template-columns: 1fr 320px; gap: 18px; }}
    .panel {{ background: white; border: 1px solid #d6dde1; border-radius: 8px; padding: 20px; }}
    .field {{ display: grid; grid-template-columns: 190px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eef2f4; }}
    .field:last-child {{ border-bottom: 0; }}
    label {{ color: #60727d; }}
    input, textarea {{ width: 100%; border: 1px solid #cfd8dc; border-radius: 6px; padding: 8px; font: inherit; }}
    .status {{ display: inline-flex; height: 26px; align-items: center; padding: 0 10px; border-radius: 6px; background: #e6f4ea; color: #186a3b; font-size: 13px; }}
  </style>
</head>
<body data-route-kind="{route_kind}" data-reservation-id="{reservation_id}" data-eopp-user="{eopp_user}">
  <header>
    <h1>{heading}</h1>
    <p>Local page for channel flow testing.</p>
  </header>
  <main>
    <div class="layout">
      <section class="panel" aria-label="Reservation card">
        <h2>{card_title}</h2>
        <div class="field">
          <label>Company:</label>
          <strong data-company-name>{company}</strong>
        </div>
        <div class="field">
          <label>EOPP user:</label>
          <strong>{eopp_user}</strong>
        </div>
        <div class="field">
          <label>Reservation ID:</label>
          <input name="reservationId" value="{reservation_id}" readonly>
        </div>
        <div class="field">
          <label>Vehicle:</label>
          <input name="vehicleNumber" value="{vehicle}" readonly>
        </div>
        <div class="field">
          <label>Comment:</label>
          <textarea name="comment" rows="3" readonly>Company: {company}. Operator: {eopp_user}.</textarea>
        </div>
      </section>
      <aside class="panel">
        <h2>Context</h2>
        <p class="status">{route_kind}</p>
        <p>This page intentionally exposes visible DOM hints and data attributes. It does not contain EOPP cookies.</p>
      </aside>
    </div>
  </main>
</body>
</html>"""


def _channel_test_page(
    *,
    title: str,
    heading: str,
    route_kind: str,
    company: str,
    eopp_user: str,
    reservation_id: str = "",
    vehicle: str = "",
) -> HTMLResponse:
    card_title = "EOPP Channel Test Card" if route_kind == "reservation_card" else "EOPP Channel Test Root"
    return HTMLResponse(
        CHANNEL_TEST_PAGE_HTML.format(
            title=title,
            heading=heading,
            route_kind=route_kind,
            company=company,
            eopp_user=eopp_user,
            reservation_id=reservation_id,
            vehicle=vehicle,
            card_title=card_title,
        )
    )


def register_frontend_routes(app):
    if os.path.isdir(FRONTEND_DIST):
        @frontend_router.get("/{full_path:path}")
        async def serve_frontend(full_path: str = ""):
            if full_path == "api" or full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
            if not full_path:
                full_path = "index.html"
            file_path = os.path.join(FRONTEND_DIST, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
    else:
        @frontend_router.get("/{full_path:path}")
        async def serve_frontend_fallback(full_path: str = ""):
            if full_path == "api" or full_path.startswith("api/"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})
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

    # Plugin-channel test pages are disabled together with the channel API for
    # the release perimeter. Keep the router definitions here so the flow can be
    # restored deliberately when consumers are ready.
    return

    @channel_test_router.get("/card/existing")
    async def test_channel_existing_card():
        return _channel_test_page(
            title="EOPP Channel Test Card",
            heading="Existing company reservation card",
            route_kind="reservation_card",
            company="Existing Carrier",
            eopp_user="Ivan Channel Master",
            reservation_id="reservation-card-existing",
            vehicle="A123BC790",
        )

    @channel_test_router.get("/card/new-company")
    async def test_channel_new_company_card():
        return _channel_test_page(
            title="EOPP Channel Test Card",
            heading="New company reservation card",
            route_kind="reservation_card",
            company="New Auto Channel Company",
            eopp_user="Olga Channel User",
            reservation_id="reservation-card-new-company",
            vehicle="B456CD790",
        )

    @channel_test_router.get("/root")
    async def test_channel_root():
        return _channel_test_page(
            title="EOPP Channel Test Root",
            heading="EOPP root page",
            route_kind="eopp_root",
            company="Root Company",
            eopp_user="Root EOPP User",
        )

    app.include_router(channel_test_router)
