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
"""

from fastapi import Query
from fastapi.responses import JSONResponse

from src.models import CreateApiKeyBody, UpdateApiKeyBody
from src.repositories import api_key_repo, tariff_repo


def _make_masked(record):
    return {
        "id": record.id,
        "label": record.label,
        "created_at": record.created_at,
        "usage_count": record.usage_count,
        "max_uses": record.max_uses,
        "active": record.active,
        "comment": record.comment,
        "is_admin": record.is_admin,
        "is_super_kiosk": record.is_super_kiosk,
    }


def register_api_key_routes(app):
    @app.post("/api-keys")
    async def create_api_key(body: CreateApiKeyBody):
        record = api_key_repo.create_key(body.label, body.max_uses)
        return JSONResponse(content=_make_masked(record) | {"key": record.key})

    @app.get("/api-keys")
    async def list_api_keys():
        keys = api_key_repo.list_keys()
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
        record = api_key_repo.update_key(
            key_id,
            label=body.label,
            max_uses=body.max_uses,
            active=body.active,
        )
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        return JSONResponse(content=_make_masked(record))

    @app.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: int):
        if api_key_repo.delete_key(key_id):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=404, content={"error": "Key not found"})

    @app.post("/api-keys/{key_id}/reset-usage")
    async def reset_api_key_usage(key_id: int):
        record = api_key_repo.reset_usage(key_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        return JSONResponse(content=_make_masked(record))

    @app.get("/validate-key")
    async def validate_api_key(api_key: str = Query(...)):
        result = api_key_repo.validate_api_key(api_key)
        if result["valid"]:
            key_record = api_key_repo.get_key_record(api_key)
            if key_record:
                result["api_key_id"] = key_record.id
                tariff = tariff_repo.get_tariff(key_record.id)
                if tariff:
                    result["price_create"] = tariff.price_create
                    result["price_reschedule"] = tariff.price_reschedule
                    result["price_create_peak"] = tariff.price_create_peak
        return JSONResponse(content=result)

    @app.get("/api-key-status")
    async def api_key_status(key: str = Query(...)):
        result = api_key_repo.validate_api_key(key)
        return JSONResponse(
            content={
                "valid": result["valid"],
                "remaining": result.get("remaining"),
                "label": result.get("label", ""),
            }
        )

    @app.get("/api-keys/{key_id}/debt")
    async def get_key_debt(key_id: int):
        from src.db.usage_log import calc_debt

        return JSONResponse(content=calc_debt(key_id))
