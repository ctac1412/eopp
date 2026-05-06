"""
EOPP Captcha Solver - Admin Routes

Админские эндпоинты:
- POST /admin/auth - аутентификация админа
- GET /admin/streams - список активных SSE соединений
- GET /admin/test-stats - статистика по тестовым кейсам
- GET /admin/benchmark - запуск бенчмарка решателя
- GET /admin/tariffs/{api_key_id} - получить тариф по апи ключу
- PUT /admin/tariffs/{api_key_id} - создать/обновить тариф
- DELETE /admin/tariffs/{api_key_id} - удалить тариф
- GET /admin/withdrawals - список выводов
- POST /admin/withdrawals - создать вывод
- PUT /admin/withdrawals/{id} - обновить вывод
- DELETE /admin/withdrawals/{id} - удалить вывод
- PATCH /admin/api-keys/{id} - обновить ключ (comment)
- PATCH /admin/usage-log/{id} - обновить лог (price, paid)
- POST /admin/generate-invoice - сгенерировать PDF-счёт

Защита: требует X-Admin-Token в заголовках (ADMIN_TOKEN)
"""

from fastapi.responses import JSONResponse

from src.db import (
    get_tariff as db_get_tariff,
    create_tariff as db_create_tariff,
    update_tariff as db_update_tariff,
    delete_tariff as db_delete_tariff,
    list_withdrawals as db_list_withdrawals,
    get_withdrawal as db_get_withdrawal,
    create_withdrawal as db_create_withdrawal,
    update_withdrawal as db_update_withdrawal,
    delete_withdrawal as db_delete_withdrawal,
    update_key as db_update_key,
    update_usage_log as db_update_usage_log,
    list_usages as db_list_usages,
    get_key_by_id as db_get_key_by_id,
    get_usage_log_entry as db_get_usage_log_entry,
)
from src.constants import ADMIN_TOKEN, PROTECTED_PATHS
from src.models import (
    AdminAuthBody,
    GenerateInvoiceBody,
    TariffBody,
    UpdateApiKeyBody,
    UpdateUsageLogBody,
    WithdrawalBody,
)
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

    @app.get("/admin/tariffs/{api_key_id}")
    async def get_admin_tariff(api_key_id: int):
        tariff = db_get_tariff(api_key_id)
        if not tariff:
            return JSONResponse(status_code=404, content={"error": "Tariff not found"})
        return JSONResponse(content=tariff)

    @app.put("/admin/tariffs/{api_key_id}")
    async def create_update_tariff(api_key_id: int, body: TariffBody):
        existing = db_get_tariff(api_key_id)
        if existing:
            tariff = db_update_tariff(api_key_id, body.price_create, body.price_reschedule)
        else:
            tariff = db_create_tariff(api_key_id, body.price_create, body.price_reschedule)
        return JSONResponse(content=tariff)

    @app.delete("/admin/tariffs/{api_key_id}")
    async def delete_admin_tariff(api_key_id: int):
        success = db_delete_tariff(api_key_id)
        if not success:
            return JSONResponse(status_code=404, content={"error": "Tariff not found"})
        return JSONResponse(content={"ok": True})

    @app.get("/admin/withdrawals")
    async def list_admin_withdrawals():
        return JSONResponse(content=db_list_withdrawals())

    @app.post("/admin/withdrawals")
    async def create_admin_withdrawal(body: WithdrawalBody):
        withdrawal = db_create_withdrawal(body.name, body.percent, body.requisites)
        return JSONResponse(content=withdrawal)

    @app.put("/admin/withdrawals/{id}")
    async def update_admin_withdrawal(id: int, body: WithdrawalBody):
        withdrawal = db_update_withdrawal(id, body.name, body.percent, body.requisites)
        if not withdrawal:
            return JSONResponse(status_code=404, content={"error": "Withdrawal not found"})
        return JSONResponse(content=withdrawal)

    @app.delete("/admin/withdrawals/{id}")
    async def delete_admin_withdrawal(id: int):
        success = db_delete_withdrawal(id)
        if not success:
            return JSONResponse(status_code=404, content={"error": "Withdrawal not found"})
        return JSONResponse(content={"ok": True})

    @app.patch("/admin/api-keys/{id}")
    async def update_api_key(id: int, body: UpdateApiKeyBody):
        key = db_update_key(id, comment=body.comment)
        if not key:
            return JSONResponse(status_code=404, content={"error": "API key not found"})
        return JSONResponse(content=key)

    @app.patch("/admin/usage-log/{id}")
    async def update_admin_usage_log(id: int, body: UpdateUsageLogBody):
        log = db_update_usage_log(id, body.price, body.paid)
        if not log:
            return JSONResponse(status_code=404, content={"error": "Usage log not found"})
        return JSONResponse(content=log)

    @app.post("/admin/generate-invoice")
    async def generate_invoice(body: GenerateInvoiceBody):
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib.units import mm
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
        except ImportError:
            return JSONResponse(
                status_code=500, content={"error": "reportlab not installed. Install with: pip install reportlab"}
            )

        import io
        import os
        from datetime import datetime

        api_key = db_get_key_by_id(body.api_key_id)
        if not api_key:
            return JSONResponse(status_code=404, content={"error": "API key not found"})

        withdrawal = db_get_withdrawal(body.withdrawal_id)
        if not withdrawal:
            return JSONResponse(status_code=404, content={"error": "Withdrawal not found"})

        usage_logs = []
        for log_id in body.usage_log_ids:
            log = db_get_usage_log_entry(log_id)
            if log:
                usage_logs.append(log)

        if not usage_logs:
            return JSONResponse(status_code=400, content={"error": "No valid usage logs provided"})

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
        elements = []
        styles = getSampleStyleSheet()

        title = Paragraph("Счёт на оплату", styles["Heading1"])
        elements.append(title)
        elements.append(Spacer(1, 12 * mm))

        now = datetime.now()
        invoice_number = f"INV-{now.strftime('%Y%m%d%H%M%S')}"
        info_data = [
            ["Номер счёта:", invoice_number],
            ["Дата:", now.strftime("%d.%m.%Y %H:%M")],
            ["Плательщик:", api_key["label"]],
            ["Получатель:", withdrawal["name"]],
            ["Реквизиты:", withdrawal["requisites"]],
        ]
        info_table = Table(info_data, colWidths=[60 * mm, 100 * mm])
        info_table.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ]
            )
        )
        elements.append(info_table)
        elements.append(Spacer(1, 15 * mm))

        table_data = [["№", "Дата", "Reservation ID", "Тип", "Цена"]]
        total = 0
        for i, log in enumerate(usage_logs, 1):
            config = log.get("config_json") or {}
            mode = config.get("mode", "create")
            op_type = "Перенос" if mode == "reschedule" else "Создание"
            price = log.get("price") or 0
            total += price
            table_data.append(
                [
                    str(i),
                    log.get("created_at", "")[:10],
                    log.get("reservation_id", "")[:20],
                    op_type,
                    f"{price} ₽",
                ]
            )

        table_data.append(["", "", "", "Итого:", f"{total} ₽"])
        commission = total * withdrawal["percent"] / 100
        table_data.append(["", "", "", f"Комиссия ({withdrawal['percent']}%):", f"{commission} ₽"])
        table_data.append(["", "", "", "К оплате:", f"{total + commission} ₽"])

        table = Table(table_data, colWidths=[10 * mm, 25 * mm, 50 * mm, 40 * mm, 30 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                    ("FONTNAME", (-2, -1), (-1, -1), "Helvetica-Bold"),
                    ("BACKGROUND", (-2, -3), (-1, -1), colors.lightgrey),
                ]
            )
        )
        elements.append(table)

        doc.build(elements)
        buffer.seek(0)

        pdf_path = os.path.join("data", "invoices", f"{invoice_number}.pdf")
        os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
        with open(pdf_path, "wb") as f:
            f.write(buffer.getvalue())

        return JSONResponse(
            content={
                "ok": True,
                "invoice_number": invoice_number,
                "path": pdf_path,
                "total": total,
                "commission": commission,
                "total_with_commission": total + commission,
            }
        )
