"""
EOPP Captcha Solver - Admin Routes

Админские эндпоинты:
- POST /admin/auth - аутентификация админа
- GET /admin/streams - список активных SSE соединений
- GET /admin/test-stats - статистика по тестовым кейсам
- POST /admin/benchmark - запуск бенчмарка решателя
- GET /admin/tariffs/{api_key_id} - получить тариф по апи ключу
- PUT /admin/tariffs/{api_key_id} - создать/обновить тариф
- DELETE /admin/tariffs/{api_key_id} - удалить тариф
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
    UpdateInvoiceBody,
    UpdateUsageLogBody,
    CreateExpenseBody,
    UpdateExpenseBody,
    CreatePayoutBody,
    UpdatePayoutBody,
    SetPayoutStatusBody,
    CreateUserBody,
    UpdateUserBody,
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

    @app.post("/admin/benchmark")
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
        from datetime import datetime

        usage_logs = []
        for log_id in body.usage_log_ids:
            log = db_get_usage_log_entry(log_id)
            if log:
                usage_logs.append(log)

        if not usage_logs:
            return JSONResponse(status_code=400, content={"error": "No valid usage logs provided"})

        debt_amount = body.debt_amount or 0
        percent_amount = body.percent_amount or 0
        tax_amount = body.tax_amount or 0
        total_amount = body.total_amount or (debt_amount + percent_amount + tax_amount)

        now = datetime.now()
        invoice_number = f"INV-{now.strftime('%Y%m%d%H%M%S')}"
        invoice_id = None

        # Сохраняем счёт в БД
        try:
            from src.db.invoices import insert_invoice
            invoice_id = insert_invoice(
                invoice_number=invoice_number,
                pdf_path="",
                comment=body.comment,
                percent_rate=body.percent_rate,
                tax_rate=body.tax_rate,
                debt_amount=debt_amount,
                percent_amount=percent_amount,
                tax_amount=tax_amount,
                total_amount=total_amount,
                paid=False,
            )

            # Привязываем usage_log к инвойсу через FK
            from src.db.connection import get_connection
            conn = get_connection()
            for log_id in body.usage_log_ids:
                conn.execute(
                    "UPDATE usage_log SET invoice_id = ?, paid = 0 WHERE id = ?",
                    (invoice_id, log_id)
                )
            conn.commit()
            conn.close()
        except Exception as db_err:
            import logging
            logging.warning(f"Failed to save invoice to DB: {db_err}")

        return JSONResponse(
            content={
                "ok": True,
                "invoice_number": invoice_number,
                "invoice_id": invoice_id,
                "debt_amount": debt_amount,
                "percent_amount": percent_amount,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
            }
        )

    @app.get("/admin/invoices")
    async def list_admin_invoices():
        from src.db.invoices import list_invoices
        return JSONResponse(content=list_invoices(limit=200))

    @app.patch("/admin/invoices/{id}")
    async def update_admin_invoice(id: int, body: UpdateInvoiceBody):
        from src.db.invoices import set_invoice_paid
        result = set_invoice_paid(id, body.paid)
        if not result:
            return JSONResponse(status_code=404, content={"error": "Invoice not found"})
        return JSONResponse(content=result)

    @app.delete("/admin/invoices/{id}")
    async def delete_admin_invoice(id: int):
        from src.db.invoices import delete_invoice
        deleted = delete_invoice(id)
        if not deleted:
            return JSONResponse(status_code=404, content={"error": "Invoice not found"})
        return JSONResponse(content={"ok": True})

    @app.get("/admin/expenses")
    async def list_admin_expenses():
        from src.db.expenses import list_expenses, get_total_expenses
        expenses = list_expenses()
        total = get_total_expenses()
        return JSONResponse(content={"expenses": expenses, "total": total})

    @app.post("/admin/expenses")
    async def create_admin_expense(body: CreateExpenseBody):
        from src.db.expenses import create_expense
        expense = create_expense(body.amount, body.reason, body.user_id, body.comment)
        return JSONResponse(content=expense)

    @app.put("/admin/expenses/{id}")
    async def update_admin_expense(id: int, body: UpdateExpenseBody):
        from src.db.expenses import update_expense
        expense = update_expense(id, body.amount, body.reason, body.comment, body.user_id)
        if not expense:
            return JSONResponse(status_code=404, content={"error": "Expense not found"})
        return JSONResponse(content=expense)

    @app.delete("/admin/expenses/{id}")
    async def delete_admin_expense(id: int):
        from src.db.expenses import delete_expense
        deleted = delete_expense(id)
        if not deleted:
            return JSONResponse(status_code=404, content={"error": "Expense not found"})
        return JSONResponse(content={"ok": True})

    @app.get("/admin/payouts")
    async def list_admin_payouts():
        from src.db.payouts import list_payouts
        return JSONResponse(content=list_payouts())

    @app.post("/admin/payouts")
    async def create_admin_payout(body: CreatePayoutBody):
        from src.db.payouts import create_payout_with_calculation
        if not body.invoice_ids or not body.expense_ids or not body.user_splits:
            return JSONResponse(status_code=400, content={"error": "invoice_ids, expense_ids и user_splits обязательны"})
        payout = create_payout_with_calculation(
            body.name,
            body.invoice_ids,
            body.expense_ids,
            body.user_splits,
        )
        return JSONResponse(content=payout)

    @app.put("/admin/payouts/{id}")
    async def update_admin_payout(id: int, body: UpdatePayoutBody):
        from src.db.payouts import update_payout
        if body.name is None:
            return JSONResponse(status_code=400, content={"error": "name required"})
        payout = update_payout(id, body.name)
        if not payout:
            return JSONResponse(status_code=404, content={"error": "Payout not found or not editable"})
        return JSONResponse(content=payout)

    @app.patch("/admin/payouts/{id}")
    async def set_admin_payout_status(id: int, body: SetPayoutStatusBody):
        from src.db.payouts import set_payout_status
        payout = set_payout_status(id, body.status)
        if not payout:
            return JSONResponse(status_code=404, content={"error": "Payout not found or not editable"})
        return JSONResponse(content=payout)

    @app.delete("/admin/payouts/{id}")
    async def delete_admin_payout(id: int):
        from src.db.payouts import delete_payout
        deleted = delete_payout(id)
        if not deleted:
            return JSONResponse(status_code=404, content={"error": "Payout not found or not deletable"})
        return JSONResponse(content={"ok": True})

    @app.post("/admin/payouts/{id}/recalculate")
    async def recalculate_admin_payout(id: int, body: CreatePayoutBody):
        from src.db.payouts import recalculate_payout
        if not body.invoice_ids or not body.expense_ids or not body.user_splits:
            return JSONResponse(status_code=400, content={"error": "invoice_ids, expense_ids и user_splits обязательны"})
        payout = recalculate_payout(id, body.invoice_ids, body.expense_ids, body.user_splits)
        if not payout:
            return JSONResponse(status_code=404, content={"error": "Payout not found or not editable"})
        return JSONResponse(content=payout)

    @app.get("/admin/users")
    async def list_admin_users():
        from src.db.users import list_users
        return JSONResponse(content=list_users())

    @app.post("/admin/users")
    async def create_admin_user(body: CreateUserBody):
        from src.db.users import create_user
        user = create_user(body.name)
        return JSONResponse(content=user)

    @app.put("/admin/users/{id}")
    async def update_admin_user(id: int, body: UpdateUserBody):
        from src.db.users import update_user
        user = update_user(id, body.name)
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        return JSONResponse(content=user)

    @app.delete("/admin/users/{id}")
    async def delete_admin_user(id: int):
        from src.db.users import delete_user
        deleted = delete_user(id)
        if not deleted:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        return JSONResponse(content={"ok": True})
