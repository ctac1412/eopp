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

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from src.models import CreateApiKeyBody, UpdateApiKeyBody
from src.policies.access_policy import token_from_request
from src.repositories import api_key_repo, tariff_repo, user_repo
from src.services.session_api_key import key_for_session_request

router = APIRouter(tags=["api_keys"])


def _tenant_company_id(request: Request) -> int | None:
    user = user_repo.get_session_user(token_from_request(request))
    if not user or user.system_role:
        return None
    if user.company_id is not None:
        return user.company_id
    for membership in getattr(user, "company_memberships", []):
        if membership.active:
            return membership.company_id
    return None


def _forbid_company_scope() -> JSONResponse:
    return JSONResponse(status_code=403, content={"error": "Forbidden: company scope required"})


def _api_key_allows_tenant(request: Request, key_id: int) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return None
    record = api_key_repo.get_key_by_id(key_id)
    if record is None:
        return None
    if record.user_id is None:
        if record.company_id == tenant_company_id:
            return None
        return _forbid_company_scope()
    user = user_repo.get_user(record.user_id)
    if not user or user.get("company_id") != tenant_company_id:
        return _forbid_company_scope()
    return None


def _requested_company_id_for_tenant(request: Request, company_id: int | None, *, default: bool = False) -> int | None | JSONResponse:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return company_id
    if company_id is None:
        return tenant_company_id if default else None
    if int(company_id) != tenant_company_id:
        return _forbid_company_scope()
    return company_id


def _guard_api_key_user(request: Request, user_id: int | None) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None or user_id is None:
        return None
    user = user_repo.get_user(user_id)
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    if user.get("company_id") != tenant_company_id:
        return _forbid_company_scope()
    return None


def _guard_privileged_key_fields(request: Request, body: UpdateApiKeyBody) -> JSONResponse | None:
    if _tenant_company_id(request) is None:
        return None
    fields = getattr(body, "model_fields_set", set())
    if {"is_admin", "is_super_kiosk"} & fields:
        return JSONResponse(status_code=403, content={"error": "Forbidden: system scope required"})
    return None


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
        "is_external": record.is_external,
        "company_id": record.company_id,
        "user_id": record.user_id,
    }


@router.get("/api-keys/public")
async def list_public_keys():
    keys = api_key_repo.list_keys()
    return JSONResponse(content=[
        {"id": k["id"], "label": k["label"], "active": k["active"]}
        for k in keys
    ])


@router.post("/api-keys")
async def create_api_key(body: CreateApiKeyBody, request: Request):
    company_id = _requested_company_id_for_tenant(request, body.company_id, default=False)
    if isinstance(company_id, JSONResponse):
        return company_id
    if body.user_id is not None:
        user_guard = _guard_api_key_user(request, body.user_id)
        if user_guard:
            return user_guard
    try:
        record = api_key_repo.create_key(
            body.label,
            body.max_uses,
            company_id=company_id,
            user_id=body.user_id,
        )
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    if body.is_external:
        api_key_repo.update_key(record.id, is_external=True)
        record = api_key_repo.get_key_by_id(record.id)
    return JSONResponse(content=_make_masked(record) | {"key": record.key})


@router.get("/api-keys")
async def list_api_keys(request: Request, include_test: bool = True):
    keys = api_key_repo.list_keys(_tenant_company_id(request), include_test_users=include_test)
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
            "company_id": k.get("company_id"),
            "company_name": k.get("company_name"),
            "user_id": k.get("user_id"),
            "user_name": k.get("user_name"),
            "is_master_key": k.get("is_master_key"),
            "executor_all_companies": k.get("executor_all_companies"),
            "executor_company_ids": k.get("executor_company_ids"),
            "executor_company_names": k.get("executor_company_names"),
            "user_role": k.get("user_role"),
        }
        if k.get("tariff"):
            item["tariff"] = k["tariff"]
        masked.append(item)
    return JSONResponse(content=masked)


@router.put("/api-keys/{key_id}")
async def update_api_key(key_id: int, body: UpdateApiKeyBody, request: Request):
    target_guard = _api_key_allows_tenant(request, key_id)
    if target_guard:
        return target_guard
    privileged_guard = _guard_privileged_key_fields(request, body)
    if privileged_guard:
        return privileged_guard
    user_guard = _guard_api_key_user(request, body.user_id)
    if user_guard:
        return user_guard
    company_id = None
    if body.company_id is not None:
        company_id = _requested_company_id_for_tenant(request, body.company_id, default=False)
        if isinstance(company_id, JSONResponse):
            return company_id
    kwargs = {
        k: v for k, v in {
            "label": body.label,
            "max_uses": body.max_uses,
            "active": body.active,
            "is_external": body.is_external,
            "company_id": company_id,
            "user_id": body.user_id,
        }.items() if v is not None
    }
    try:
        record = api_key_repo.update_key(key_id, **kwargs)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    if not record:
        return JSONResponse(status_code=404, content={"error": "Key not found"})
    return JSONResponse(content=_make_masked(record))


@router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: int, request: Request):
    target_guard = _api_key_allows_tenant(request, key_id)
    if target_guard:
        return target_guard
    if api_key_repo.delete_key(key_id):
        return JSONResponse(content={"ok": True})
    return JSONResponse(status_code=404, content={"error": "Key not found"})


@router.post("/api-keys/{key_id}/reset-usage")
async def reset_api_key_usage(key_id: int, request: Request):
    target_guard = _api_key_allows_tenant(request, key_id)
    if target_guard:
        return target_guard
    record = api_key_repo.reset_usage(key_id)
    if not record:
        return JSONResponse(status_code=404, content={"error": "Key not found"})
    return JSONResponse(content=_make_masked(record))


@router.get("/validate-key")
async def validate_api_key(request: Request):
    key_record, error = key_for_session_request(request, enforce_usage_limit=False)
    if error:
        return error
    if request.query_params.get("api_key"):
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    result = api_key_repo.validate_api_key(key_record.key)
    if result["valid"]:
        result["api_key_id"] = key_record.id
        tariff, _source = tariff_repo.get_effective_tariff(
            key_record.id,
            key_record.company_id,
        )
        if tariff:
            result["price_create"] = tariff.price_create
            result["price_reschedule"] = tariff.price_reschedule
            result["price_create_peak"] = tariff.price_create_peak
    return JSONResponse(content=result)


@router.get("/api-key-status")
async def api_key_status(request: Request):
    key_record, error = key_for_session_request(request, enforce_usage_limit=False)
    if error:
        return error
    if request.query_params.get("key"):
        return JSONResponse(status_code=400, content={"error": "key is no longer accepted"})
    result = api_key_repo.validate_api_key(key_record.key)
    return JSONResponse(
        content={
            "valid": result["valid"],
            "remaining": result.get("remaining"),
            "label": result.get("label", ""),
        }
    )


@router.get("/api-keys/{key_id}/debt")
async def get_key_debt(key_id: int):
    from src.db.usage_log import calc_debt

    return JSONResponse(content=calc_debt(key_id))
