"""Admin routes.

HTTP adapters for admin auth, monitoring, billing, users, and captcha replay.
Business rules live in services; storage calls live behind repositories.
"""

from fastapi.responses import JSONResponse

from src.db import check_admin_token as db_check_admin_token
from src.schemas.billing import (
    CreateInvoiceBody,
    CreateExpenseBody,
    CreatePayoutBody,
    CreateUserBody,
    GenerateInvoiceBody,
    PreviewPayoutBody,
    SetPayoutStatusBody,
    TariffBody,
    UpdateApiKeyBody,
    UpdateExpenseBody,
    UpdateInvoiceBody,
    UpdatePayoutBody,
    UpdateUsageLogBody,
    UpdateUserBody,
)
from src.policies.access_policy import requires_admin
from src.schemas.auth import AdminAuthBody
from src.services import billing_service
from src.utils import (
    get_connected_streams,
    get_test_stats,
    run_benchmark_cached,
)


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request, call_next):
        path = request.url.path
        if requires_admin(request.method, path):
            token = request.headers.get("X-Admin-Token")
            if not token or not db_check_admin_token(token):
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        response = await call_next(request)
        return response

    return admin_auth_middleware


def _json_result(result):
    status, content = result
    return JSONResponse(status_code=status, content=content)


def register_admin_routes(app):
    @app.post("/admin/auth")
    async def admin_auth(body: AdminAuthBody):
        if db_check_admin_token(body.token):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    @app.get("/admin/streams")
    async def admin_streams():
        return JSONResponse(content=get_connected_streams())

    @app.get("/admin/test-stats")
    async def admin_test_stats():
        return JSONResponse(content=get_test_stats())

    @app.post("/admin/benchmark")
    async def admin_benchmark():
        return JSONResponse(content=run_benchmark_cached())

    @app.get("/admin/tariffs/{api_key_id}")
    async def get_admin_tariff(api_key_id: int):
        return _json_result(billing_service.get_tariff(api_key_id))

    @app.put("/admin/tariffs/{api_key_id}")
    async def create_update_tariff(api_key_id: int, body: TariffBody):
        return _json_result(billing_service.upsert_tariff(api_key_id, body))

    @app.delete("/admin/tariffs/{api_key_id}")
    async def delete_admin_tariff(api_key_id: int):
        return _json_result(billing_service.delete_tariff(api_key_id))

    @app.patch("/admin/api-keys/{id}")
    async def update_api_key(id: int, body: UpdateApiKeyBody):
        return _json_result(billing_service.update_api_key(id, body))

    @app.patch("/admin/usage-log/{id}")
    async def update_admin_usage_log(id: int, body: UpdateUsageLogBody):
        return _json_result(billing_service.update_usage_log(id, body))

    @app.post("/admin/generate-invoice")
    async def generate_invoice(body: GenerateInvoiceBody):
        return _json_result(billing_service.generate_invoice(body))

    @app.get("/admin/invoices")
    async def list_admin_invoices():
        return _json_result(billing_service.list_invoices())

    @app.post("/admin/invoices")
    async def create_admin_invoice(body: CreateInvoiceBody):
        return _json_result(billing_service.create_invoice(body))

    @app.patch("/admin/invoices/{id}")
    async def update_admin_invoice(id: int, body: UpdateInvoiceBody):
        return _json_result(billing_service.update_invoice(id, body))

    @app.delete("/admin/invoices/{id}")
    async def delete_admin_invoice(id: int):
        return _json_result(billing_service.delete_invoice(id))

    @app.get("/admin/expenses")
    async def list_admin_expenses():
        return _json_result(billing_service.list_expenses())

    @app.post("/admin/expenses")
    async def create_admin_expense(body: CreateExpenseBody):
        return _json_result(billing_service.create_expense(body))

    @app.put("/admin/expenses/{id}")
    async def update_admin_expense(id: int, body: UpdateExpenseBody):
        return _json_result(billing_service.update_expense(id, body))

    @app.delete("/admin/expenses/{id}")
    async def delete_admin_expense(id: int):
        return _json_result(billing_service.delete_expense(id))

    @app.get("/admin/payouts")
    async def list_admin_payouts():
        return _json_result(billing_service.list_payouts())

    @app.post("/admin/payouts/preview")
    async def preview_admin_payout(body: PreviewPayoutBody):
        return _json_result(billing_service.preview_payout(body))

    @app.get("/admin/payouts/available")
    async def get_available_resources():
        return _json_result(billing_service.available_resources())

    @app.post("/admin/payouts")
    async def create_admin_payout(body: CreatePayoutBody):
        return _json_result(billing_service.create_payout(body))

    @app.put("/admin/payouts/{id}")
    async def update_admin_payout(id: int, body: UpdatePayoutBody):
        return _json_result(billing_service.update_payout(id, body))

    @app.patch("/admin/payouts/{id}")
    async def set_admin_payout_status(id: int, body: SetPayoutStatusBody):
        return _json_result(billing_service.set_payout_status(id, body))

    @app.delete("/admin/payouts/{id}")
    async def delete_admin_payout(id: int):
        return _json_result(billing_service.delete_payout(id))

    @app.post("/admin/payouts/{id}/recalculate")
    async def recalculate_admin_payout(id: int, body: CreatePayoutBody):
        return _json_result(billing_service.recalculate_payout(id, body))

    @app.get("/admin/users")
    async def list_admin_users():
        return _json_result(billing_service.list_users())

    @app.post("/admin/users")
    async def create_admin_user(body: CreateUserBody):
        return _json_result(billing_service.create_user(body))

    @app.put("/admin/users/{id}")
    async def update_admin_user(id: int, body: UpdateUserBody):
        return _json_result(billing_service.update_user(id, body))

    @app.delete("/admin/users/{id}")
    async def delete_admin_user(id: int):
        return _json_result(billing_service.delete_user(id))

    @app.post("/admin/captchas/send-selected")
    async def send_selected_captchas(body: dict):
        import json
        import os
        import threading
        import time

        from src.constants import NO_VALID_DIR, VALID_DIR
        from src.utils import push_sse, assemble_captchas, get_connected_streams

        captcha_ids = body.get("captcha_ids", [])
        if not captcha_ids:
            return JSONResponse(status_code=400, content={"error": "РќРµС‚ РІС‹Р±СЂР°РЅРЅС‹С… РєР°РїС‡"})

        streams = get_connected_streams()
        if not streams:
            return JSONResponse(status_code=400, content={"error": "РќРµС‚ Р°РєС‚РёРІРЅС‹С… SSE РїРѕРґРєР»СЋС‡РµРЅРёР№"})

        def send_captchas():
            for cid in captcha_ids:
                for d in [VALID_DIR, NO_VALID_DIR]:
                    filepath = os.path.join(d, f"{cid}.json")
                    if os.path.exists(filepath):
                        try:
                            with open(filepath) as f:
                                data = json.load(f)
                            puzzle = data.get("puzzle", data)
                            tiles = puzzle.get("tiles", [])
                            variants = puzzle.get("variantsCapture", [])
                            valid_index = data.get("valid_index")
                            generated = assemble_captchas(tiles, variants, valid_index)
                            push_sse({
                                "type": "new_captcha",
                                "captcha_id": cid,
                                "images": {str(g["index"]): g["image"] for g in generated},
                                "count": len(generated),
                                "top3": [],
                                "created_at": time.time(),
                                "timeout": 30,
                                "owner_label": "replay",
                                "owner_api_key_id": -1,
                            })
                            print(f"Sent replay captcha {cid}")
                            time.sleep(1)
                        except Exception as e:
                            print(f"Error sending replay captcha {cid}: {e}")
                        break

        t = threading.Thread(target=send_captchas, daemon=True)
        t.start()

        return JSONResponse(content={"sent": len(captcha_ids)})

    @app.get("/admin/captchas")
    async def list_admin_captchas(
        status: str | None = None,
        api_key_id: int | None = None,
    ):
        from src.db.captchas import list_captchas
        from src.db import get_usage_log_entry, get_key_by_id

        rows = list_captchas()
        result = []
        for r in rows:
            if status and r["status"] != status:
                continue
            ul = get_usage_log_entry(r["usage_log_id"])
            if api_key_id:
                if not ul or ul["api_key_id"] != api_key_id:
                    continue
            key_label = None
            if ul:
                key_info = get_key_by_id(ul["api_key_id"])
                if key_info:
                    key_label = key_info["label"]
            entry = dict(r)
            entry["key_label"] = key_label
            result.append(entry)
        return JSONResponse(content=result)
