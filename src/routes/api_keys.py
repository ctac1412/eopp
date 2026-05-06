"""
EOPP Captcha Solver - API Keys Routes

Эндпоинты управления API ключами:
- POST /api-keys - создать ключ
- GET /api-keys - список всех ключей
- PUT /api-keys/{id} - обновить ключ
- DELETE /api-keys/{id} - удалить ключ
- GET /validate-key - валидация ключа
- GET /api-key-status - статус ключа (оставшиеся использования)
- POST /api-keys/{id}/reset-usage - сбросить счётчик использования

Использует SQLite базу из src/api_keys.py
"""

from fastapi import Query
from fastapi.responses import JSONResponse

from src.db import (
    create_key,
    delete_key,
    get_key_record,
    get_tariff,
    list_keys,
    list_usages,
    reset_usage,
    update_key,
    validate_key,
)
from src.models import (
    CreateApiKeyBody,
    UpdateApiKeyBody,
)


def register_api_key_routes(app):
    @app.post("/api-keys")
    async def create_api_key(body: CreateApiKeyBody):
        record = create_key(body.label, body.max_uses)
        return JSONResponse(content=record)

    @app.get("/api-keys")
    async def list_api_keys():
        keys = list_keys()
        masked = []
        for k in keys:
            key_val = k["key"]
            masked_key = key_val[:4] + "••••" + key_val[-4:]
            item = {
                "id": k["id"],
                "key": key_val,
                "masked_key": masked_key,
                "label": k["label"],
                "created_at": k["created_at"],
                "usage_count": k["usage_count"],
                "max_uses": k["max_uses"],
                "active": k["active"],
                "comment": k.get("comment"),
                "debt": k.get("debt", {"unpaid_count": 0, "no_price_count": 0, "unpaid_total": 0}),
            }
            if k.get("tariff"):
                item["tariff"] = k["tariff"]
            masked.append(item)
        return JSONResponse(content=masked)

    @app.put("/api-keys/{key_id}")
    async def update_api_key(key_id: int, body: UpdateApiKeyBody):
        record = update_key(
            key_id,
            label=body.label,
            max_uses=body.max_uses,
            active=body.active,
        )
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: int):
        if delete_key(key_id):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=404, content={"error": "Key not found"})

    @app.post("/api-keys/{key_id}/reset-usage")
    async def reset_api_key_usage(key_id: int):
        record = reset_usage(key_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.get("/validate-key")
    async def validate_api_key(api_key: str = Query(...)):
        result = validate_key(key=api_key)
        if result["valid"]:
            key_record = get_key_record(api_key)
            if key_record:
                result["api_key_id"] = key_record["id"]
                tariff = get_tariff(key_record["id"])
                if tariff:
                    result["price_create"] = tariff["price_create"]
                    result["price_reschedule"] = tariff["price_reschedule"]
        return JSONResponse(content=result)

    @app.get("/api-key-status")
    async def api_key_status(key: str = Query(...)):
        result = validate_key(key)
        return JSONResponse(
            content={
                "valid": result["valid"],
                "remaining": result.get("remaining"),
                "label": result.get("label", ""),
            }
        )

    @app.get("/api-keys/{key_id}/debt")
    async def get_key_debt(key_id: int):
        records = list_usages(key_id)
        unpaid_count = 0
        no_price_count = 0
        unpaid_total = 0

        for r in records:
            if r["status"] != "confirmed":
                continue
            if r["price"] is None:
                no_price_count += 1
                continue
            if r["paid"] is not True:
                unpaid_count += 1
                unpaid_total += r["price"]

        return JSONResponse(content={
            "unpaid_count": unpaid_count,
            "no_price_count": no_price_count,
            "unpaid_total": unpaid_total,
        })
