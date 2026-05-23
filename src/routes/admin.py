"""Admin routes.

HTTP adapters for admin auth, monitoring, billing, users, and captcha replay.
Business rules live in services; storage calls live behind repositories.
"""

import json
import os
from datetime import datetime

from fastapi.responses import JSONResponse

from src.benchmark import run_benchmark_cached
from src.captcha_assembly import assemble_captchas, get_valid_variant_index
from src.constants import NO_VALID_DIR, VALID_DIR
from src.db import check_admin_token as db_check_admin_token
from src.models import (
    AdminAuthBody,
    CaptchaLabelSaveBody,
    CompanyAliasBody,
    CompanyBillingSettingBody,
    CreateExpenseBody,
    CreateInvoiceBody,
    CreatePayoutBody,
    CreatePrepaidPackageBody,
    CreateUserBody,
    GenerateInvoiceBody,
    OpenInvoiceBody,
    PreviewPayoutBody,
    SendSelectedCaptchasBody,
    SetPayoutStatusBody,
    TariffBody,
    TelegramPreviewBody,
    TopUpPrepaidPackageBody,
    UpdateApiKeyBody,
    UpdateExpenseBody,
    UpdateInvoiceBody,
    UpdatePayoutBody,
    UpdatePrepaidPackageBody,
    UpdateUsageLogBody,
    UpdateUserBody,
)
from src.policies.access_policy import requires_admin
from src.services import billing_service, reporting_service
from src.sse import get_connected_streams, push_sse
from src.test_runner import get_test_stats


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request, call_next):
        path = request.url.path
        if requires_admin(request.method, path):
            token = request.headers.get("X-Admin-Token") or request.query_params.get("admin_token")
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

    @app.get("/admin/daily-report")
    async def admin_daily_report(day: str | None = None):
        parsed_day = None
        if day:
            try:
                parsed_day = datetime.fromisoformat(day).date()
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"error": "invalid day format, expected YYYY-MM-DD"}
                )
        report = reporting_service.build_daily_report(parsed_day)
        return JSONResponse(content=report)

    @app.get("/admin/daily-report-text")
    async def admin_daily_report_text(day: str | None = None):
        parsed_day = None
        if day:
            try:
                parsed_day = datetime.fromisoformat(day).date()
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"error": "invalid day format, expected YYYY-MM-DD"}
                )
        report = reporting_service.build_daily_report(parsed_day)
        return JSONResponse(
            content={
                "text": reporting_service.render_telegram_daily_report(report),
                "report": report,
            }
        )

    @app.post("/admin/telegram/preview")
    async def admin_telegram_preview(body: TelegramPreviewBody):
        return JSONResponse(content=reporting_service.telegram_command_preview(body.command))

    @app.get("/admin/captcha-label/next")
    async def admin_captcha_label_next():
        if not os.path.isdir(NO_VALID_DIR):
            return JSONResponse(status_code=404, content={"error": "no unlabeled captchas"})
        files = sorted(f for f in os.listdir(NO_VALID_DIR) if f.endswith(".json"))
        if not files:
            return JSONResponse(status_code=404, content={"error": "no unlabeled captchas"})
        filename = files[0]
        path = os.path.join(NO_VALID_DIR, filename)
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return JSONResponse(status_code=500, content={"error": "failed to read captcha file"})
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])
        if not tiles or not variants:
            return JSONResponse(status_code=422, content={"error": "invalid captcha structure"})
        valid_index = get_valid_variant_index(data)
        generated = assemble_captchas(tiles, variants, valid_index)
        captcha_id = os.path.splitext(filename)[0]
        return JSONResponse(
            content={
                "captcha_id": captcha_id,
                "filename": filename,
                "variants_count": len(generated),
                "images": {str(item["index"]): item["image"] for item in generated},
            }
        )

    @app.post("/admin/captcha-label/save")
    async def admin_captcha_label_save(body: CaptchaLabelSaveBody):
        source_path = os.path.join(NO_VALID_DIR, f"{body.captcha_id}.json")
        if not os.path.exists(source_path):
            return JSONResponse(status_code=404, content={"error": "captcha file not found"})
        try:
            with open(source_path, encoding="utf-8") as f:
                data = json.load(f)
            puzzle = data.get("puzzle", data)
            variants = puzzle.get("variantsCapture", [])
            if body.variant_index < 0 or body.variant_index >= len(variants):
                return JSONResponse(
                    status_code=422, content={"error": "variant_index out of range"}
                )
            data["valid_index"] = body.variant_index
            os.makedirs(VALID_DIR, exist_ok=True)
            target_path = os.path.join(VALID_DIR, f"{body.captcha_id}.json")
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.remove(source_path)
            return JSONResponse(
                content={
                    "ok": True,
                    "captcha_id": body.captcha_id,
                    "valid_index": body.variant_index,
                }
            )
        except Exception as exc:
            return JSONResponse(status_code=500, content={"error": f"save failed: {exc}"})

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

    @app.post("/admin/open-invoices/ensure")
    async def ensure_admin_open_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.ensure_open_invoice(body.company))

    @app.post("/admin/auto-invoices/open")
    async def open_admin_auto_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.ensure_open_invoice(body.company))

    @app.post("/admin/open-invoices/issue")
    async def issue_admin_open_invoice(body: OpenInvoiceBody):
        return _json_result(billing_service.issue_open_invoice(body.company, body.comment))

    @app.get("/admin/company-billing-settings")
    async def list_admin_company_billing_settings():
        return _json_result(billing_service.list_company_billing_settings())

    @app.put("/admin/company-billing-settings/{company}")
    async def update_admin_company_billing_settings(company: str, body: CompanyBillingSettingBody):
        return _json_result(billing_service.update_company_billing_settings(company, body))

    @app.get("/admin/company-aliases")
    async def list_admin_company_aliases():
        return _json_result(billing_service.list_company_aliases())

    @app.post("/admin/company-aliases")
    async def upsert_admin_company_alias(body: CompanyAliasBody):
        return _json_result(billing_service.upsert_company_alias(body))

    @app.delete("/admin/company-aliases/{alias}")
    async def delete_admin_company_alias(alias: str):
        return _json_result(billing_service.delete_company_alias(alias))

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

    @app.get("/admin/prepaid-packages")
    async def list_admin_prepaid_packages():
        return _json_result(billing_service.list_prepaid_packages())

    @app.post("/admin/prepaid-packages")
    async def create_admin_prepaid_package(body: CreatePrepaidPackageBody):
        return _json_result(billing_service.create_prepaid_package(body))

    @app.patch("/admin/prepaid-packages/{id}")
    async def update_admin_prepaid_package(id: int, body: UpdatePrepaidPackageBody):
        return _json_result(billing_service.update_prepaid_package(id, body))

    @app.delete("/admin/prepaid-packages/{id}")
    async def delete_admin_prepaid_package(id: int):
        return _json_result(billing_service.delete_prepaid_package(id))

    @app.post("/admin/prepaid-packages/{id}/top-up")
    async def top_up_admin_prepaid_package(id: int, body: TopUpPrepaidPackageBody):
        return _json_result(billing_service.top_up_prepaid_package(id, body))

    @app.get("/admin/prepaid-deductions")
    async def list_admin_prepaid_deductions(
        package_id: int | None = None, api_key_id: int | None = None
    ):
        return _json_result(billing_service.list_prepaid_deductions(package_id, api_key_id))

    @app.post("/admin/captchas/send-selected")
    async def send_selected_captchas(body: SendSelectedCaptchasBody):
        import json
        import os
        import threading
        import time

        from src.captcha_assembly import assemble_captchas, get_valid_variant_index
        from src.constants import NO_VALID_DIR, VALID_DIR
        from src.sse import get_connected_streams

        captcha_ids = body.captcha_ids
        if not captcha_ids:
            return JSONResponse(status_code=400, content={"error": "Нет выбранных капч"})

        streams = get_connected_streams()
        if not streams:
            return JSONResponse(status_code=400, content={"error": "Нет активных SSE подключений"})

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
                            valid_index = get_valid_variant_index(data)
                            generated = assemble_captchas(tiles, variants, valid_index)
                            push_sse(
                                {
                                    "type": "new_captcha",
                                    "captcha_id": cid,
                                    "images": {str(g["index"]): g["image"] for g in generated},
                                    "count": len(generated),
                                    "top3": [],
                                    "created_at": time.time(),
                                    "timeout": 30,
                                    "owner_label": "replay",
                                    "owner_api_key_id": -1,
                                }
                            )
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
        from src.db import get_key_by_id, get_usage_log_entry
        from src.db.captchas import list_captchas

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
            entry["api_key_id"] = ul["api_key_id"] if ul else None
            result.append(entry)
        return JSONResponse(content=result)

    @app.post("/admin/slots-group/clear")
    async def admin_slots_group_clear():
        from src.services.slots_group_service import clear as slots_clear

        return JSONResponse(content=slots_clear())

    @app.get("/admin/stream/slots")
    async def admin_slots_stream(admin_token: str | None = None):
        from fastapi.responses import StreamingResponse

        from src.db import check_admin_token
        from src.services.slots_group_service import get_events_since, stats

        if not admin_token or not check_admin_token(admin_token):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})

        async def event_generator():
            import asyncio

            last_index = 0
            while True:
                events, last_index = get_events_since(last_index)
                if events:
                    payload = {
                        "type": "events",
                        "events": events,
                        "stats": stats(),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(1)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
