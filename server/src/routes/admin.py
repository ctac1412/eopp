"""Admin routes.

HTTP adapters for admin auth, monitoring, billing, users, and captcha replay.
Business rules live in services; storage calls live behind repositories.
"""

import base64
import io
import json
import logging
import os
from datetime import datetime
from pathlib import Path

from PIL import Image

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from src.benchmark import run_benchmark_cached
from src.models import (
    AdminAuthBody,
    CaptchaLabelSaveBody,
    CompanyAliasBody,
    CompanyBillingSettingBody,
    CompanyBody,
    CreateExpenseBody,
    FinanceEntryBody,
    CreateInvoiceBody,
    CreatePayoutBody,
    CreatePrepaidPackageBody,
    CreateUserBody,
    GenerateInvoiceBody,
    CompanyAccessBody,
    OpenInvoiceBody,
    PreviewPayoutBody,
    SendSelectedCaptchasBody,
    SetPayoutStatusBody,
    TariffBody,
    TelegramPreviewBody,
    TopUpPrepaidPackageBody,
    UpdateApiKeyBody,
    UpdateCompanyBody,
    UpdateExpenseBody,
    UpdateFinanceEntryBody,
    UpdateInvoiceBody,
    UpdatePayoutBody,
    UpdatePrepaidPackageBody,
    UpdateUsageLogBody,
    UpdateUserBody,
    UserCompanyAccessBody,
)
from src.modules.access.permissions import Permission, serialize_roles
from src.modules.access.service import AccessService
from src.modules.audit.service import AuditService
from src.policies.access_policy import (
    ADMIN_SESSION_COOKIE,
    authorize_request,
    requires_admin,
    token_from_request,
)
from src.repositories import api_key_repo, company_repo, usage_log_repo, user_company_access_repo, user_repo
from src.routes.auth import login_response

logger = logging.getLogger("eopp.admin")
from src.services import billing_service, captcha_service, reporting_service
from src.sse import get_connected_streams
from src.test_runner import get_test_stats

router = APIRouter(prefix="/admin", tags=["admin"])


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request, call_next):
        path = request.url.path
        if requires_admin(request.method, path):
            token = token_from_request(request)
            decision = authorize_request(request.method, path, token)
            request.state.access_decision = decision
            if not decision.allowed and decision.reason == "unauthenticated":
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
            if not decision.allowed:
                return JSONResponse(
                    status_code=403,
                    content={"error": f"Forbidden: permission {decision.permission} required"},
                )
        response = await call_next(request)
        return response

    return admin_auth_middleware


def _json_result(result):
    status, content = result
    return JSONResponse(status_code=status, content=content)


def _access_decision_for_request(request: Request, permission: Permission):
    """Return middleware decision or recompute it for route-level audit context."""
    decision = getattr(request.state, "access_decision", None)
    if decision is not None:
        return decision
    token = token_from_request(request)
    return AccessService().authorize_token(token, permission)


def _audit_business_action(
    request: Request,
    action: str,
    permission: Permission,
    target_type: str,
    target_id: int | None = None,
    metadata: dict | None = None,
) -> None:
    """Enqueue one best-effort business audit event for a successful route."""
    AuditService().enqueue_business_action(
        action,
        decision=_access_decision_for_request(request, permission),
        target_type=target_type,
        target_id=target_id,
        metadata=metadata,
    )


def _session_user(request: Request):
    return user_repo.get_session_user(token_from_request(request))


def _tenant_company_id(request: Request) -> int | None:
    user = _session_user(request)
    if not user or user.system_role:
        return None
    if user.company_id is not None:
        return user.company_id
    for membership in getattr(user, "company_memberships", []):
        if membership.active:
            return membership.company_id
    return None


def _require_system_scope(request: Request) -> JSONResponse | None:
    user = _session_user(request)
    if user and user.system_role:
        return None
    return JSONResponse(status_code=403, content={"error": "Forbidden: system scope required"})


def _forbid_company_scope() -> JSONResponse:
    return JSONResponse(status_code=403, content={"error": "Forbidden: company scope required"})


def _company_ids_from_user_body(body) -> set[int]:
    ids: set[int] = set()
    if getattr(body, "company_id", None) is not None:
        ids.add(int(body.company_id))
    for membership in getattr(body, "company_memberships", None) or []:
        if membership.get("company_id") is not None:
            ids.add(int(membership["company_id"]))
    for attr in ("operator_profile", "finance_profile"):
        profile = getattr(body, attr, None) or {}
        if profile.get("company_id") is not None:
            ids.add(int(profile["company_id"]))
        for company_id in profile.get("company_ids") or []:
            ids.add(int(company_id))
    return ids


def _guard_tenant_user_body(request: Request, body, *, default_company: bool = False) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return None
    if "system_role" in getattr(body, "model_fields_set", set()):
        return _forbid_company_scope()
    if getattr(body, "company_id", None) is None and default_company:
        body.company_id = tenant_company_id
    company_ids = _company_ids_from_user_body(body)
    if any(company_id != tenant_company_id for company_id in company_ids):
        return _forbid_company_scope()
    return None


def _guard_tenant_access_payload(
    request: Request,
    user_id: int,
    payload: dict,
) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return None
    target_guard = _guard_tenant_user_target(request, user_id)
    if target_guard:
        return target_guard
    for assignment in payload.values():
        if not isinstance(assignment, dict):
            continue
        if assignment.get("all_companies"):
            return _forbid_company_scope()
        for company_id in assignment.get("company_ids") or []:
            if int(company_id) != tenant_company_id:
                return _forbid_company_scope()
    return None


def _guard_tenant_company_users(
    request: Request,
    company_id: int,
    user_ids: list[int],
) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is not None and int(company_id) != tenant_company_id:
        return _forbid_company_scope()
    if tenant_company_id is None:
        return None
    for user_id in user_ids:
        user = user_repo.get_user(int(user_id))
        if user and user.get("company_id") != tenant_company_id:
            return _forbid_company_scope()
    return None


def _guard_tenant_user_target(request: Request, user_id: int) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return None
    user = user_repo.get_user(user_id)
    if not user:
        return None
    if user.get("company_id") != tenant_company_id:
        return _forbid_company_scope()
    return None


def _tenant_company_name(request: Request) -> str | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None:
        return None
    company = company_repo.get_company(tenant_company_id)
    return company.name if company else None


def _guard_tenant_company_name(request: Request, company_name: str | None) -> JSONResponse | None:
    tenant_company_name = _tenant_company_name(request)
    if tenant_company_name is None:
        return None
    if company_name != tenant_company_name:
        return _forbid_company_scope()
    return None


def _guard_tenant_invoice_target(request: Request, invoice_id: int) -> JSONResponse | None:
    tenant_company_name = _tenant_company_name(request)
    if tenant_company_name is None:
        return None
    from src.db.invoices import get_invoice

    invoice = get_invoice(invoice_id)
    if invoice is None:
        return None
    if invoice.get("company") != tenant_company_name:
        return _forbid_company_scope()
    return None


def _guard_tenant_api_key_target(request: Request, api_key_id: int | None) -> JSONResponse | None:
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is None or api_key_id is None:
        return None
    key = api_key_repo.get_key_by_id(int(api_key_id))
    if key is None:
        return None
    if key.user_id is None:
        if key.company_id == tenant_company_id:
            return None
        return _forbid_company_scope()
    user = user_repo.get_user(int(key.user_id))
    if not user or user.get("company_id") != tenant_company_id:
        return _forbid_company_scope()
    return None


def _prepaid_package_api_key_id(package_id: int) -> int | None:
    from src.entities import PrepaidPackage, get_session

    with get_session() as session:
        package = session.get(PrepaidPackage, package_id)
        return package.api_key_id if package else None


def _guard_tenant_prepaid_package_target(request: Request, package_id: int) -> JSONResponse | None:
    api_key_id = _prepaid_package_api_key_id(package_id)
    if api_key_id is None:
        return None
    return _guard_tenant_api_key_target(request, api_key_id)


def _tail_lines(path: Path, limit: int) -> list[str]:
    if limit <= 0:
        return []
    with path.open("r", encoding="utf-8", errors="replace") as file:
        return file.readlines()[-limit:]


@router.post("/auth")
async def admin_auth(body: AdminAuthBody):
    return login_response(body)


@router.get("/roles")
async def admin_roles():
    return JSONResponse(content={"roles": serialize_roles()})


@router.post("/logout")
async def admin_logout():
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return response


@router.get("/streams")
async def admin_streams():
    return JSONResponse(content=get_connected_streams())


@router.get("/audit")
async def admin_audit_log(limit: int = 200):
    """Return recent security, admin, and business audit events."""
    from src.modules.audit.repository import AuditRepository

    return JSONResponse(content=AuditRepository().list_events(limit=max(1, min(limit, 1000))))


@router.get("/dashboard")
async def admin_dashboard():
    from src.routes.distribution import distribution_states
    from src.sse import lock as sse_lock, pending as sse_pending, sse_queues
    from src.repositories import operator_repo
    from src.auto_operator import AUTO_SOLVER_ENABLED, _pending_callbacks as rucaptcha_pending

    with sse_lock:
        sse_total = sum(len(v) for v in sse_queues.values())
        sse_keys = list(sse_queues.keys())

    operators = operator_repo.list_operators()
    online_ops = [o for o in operators if o.get("online")]

    return JSONResponse(content={
        "pending_captchas": len(sse_pending),
        "distribution_states": len(distribution_states),
        "sse_connections": sse_total,
        "sse_api_key_ids": sse_keys,
        "operators_total": len(operators),
        "operators_online": len(online_ops),
        "rucaptcha_enabled": AUTO_SOLVER_ENABLED,
        "rucaptcha_pending_callbacks": len(rucaptcha_pending),
    })


@router.get("/test-stats")
async def admin_test_stats():
    return JSONResponse(content=get_test_stats())


@router.get("/backend-logs")
async def admin_backend_logs(lines: int = 300):
    limit = max(1, min(lines, 1000))
    raw_path = os.environ.get("EOPP_BACKEND_LOG_PATH", "data/backend.log")
    log_path = Path(raw_path)
    if not log_path.exists():
        return JSONResponse(
            status_code=404,
            content={
                "error": "log_file_not_found",
                "path": str(log_path),
                "lines": [],
            },
        )
    return JSONResponse(
        content={
            "path": str(log_path),
            "limit": limit,
            "lines": [line.rstrip("\n") for line in _tail_lines(log_path, limit)],
        }
    )


@router.post("/benchmark")
async def admin_benchmark():
    return JSONResponse(content=run_benchmark_cached())


@router.get("/daily-report")
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


@router.get("/daily-report-text")
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


@router.get("/finance-report")
async def admin_finance_report(start: str | None = None, end: str | None = None):
    try:
        report = reporting_service.build_finance_report(start=start, end=end)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid date format, expected ISO date or datetime"},
        )
    return JSONResponse(content=report)


@router.post("/telegram/preview")
async def admin_telegram_preview(body: TelegramPreviewBody):
    return JSONResponse(content=reporting_service.telegram_command_preview(body.command))


@router.get("/captcha-label/{captcha_id}")
async def admin_captcha_label_by_id(captcha_id: str):
    result = captcha_service.read_label_captcha(captcha_id)
    if not result:
        return JSONResponse(status_code=404, content={"error": "captcha not found"})
    return JSONResponse(content=result)


@router.post("/captcha-label/save")
async def admin_captcha_label_save(body: CaptchaLabelSaveBody):
    status, content = captcha_service.save_captcha_label(body.captcha_id, body.variant_index)
    return JSONResponse(status_code=status, content=content)


@router.post("/captcha-label/{captcha_id}/save-boxes")
async def admin_captcha_label_save_boxes(captcha_id: str, body: dict):
    """Save bounding boxes for icon-click captcha labeling."""
    boxes = body.get("boxes", [])
    if not isinstance(boxes, list):
        return JSONResponse(status_code=400, content={"error": "boxes must be a list"})
    status, content = captcha_service.save_captcha_boxes(captcha_id, boxes)
    return JSONResponse(status_code=status, content=content)


@router.post("/captcha-label/{captcha_id}/save-coordinates")
async def admin_captcha_label_save_coordinates(captcha_id: str, body: dict):
    """Save click coordinates for icon-click captcha labeling (points mode)."""
    coordinates = body.get("coordinates", [])
    if not isinstance(coordinates, list):
        return JSONResponse(status_code=400, content={"error": "coordinates must be a list"})
    status, content = captcha_service.save_captcha_coordinates(captcha_id, coordinates)
    return JSONResponse(status_code=status, content=content)


@router.post("/captcha-label/{captcha_id}/recompute")
async def admin_captcha_label_recompute(captcha_id: str):
    """Recompute solver Top-1 using current classification-based solver."""
    from src.services import captcha_file_service
    from src.captcha_solver_engine.classifier import classify_captcha
    from src.captcha_solver_engine.common import build_captcha_context
    from src.captcha_solver_engine.solvers import solver_for_classification

    data = captcha_file_service.load_captcha_payload(captcha_id)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "Captcha not found"})

    context = build_captcha_context(data)
    classification = classify_captcha(context)
    solver = solver_for_classification(classification)

    solver_output = solver.solve(context, classification, edge_trim=3, verbose=False)

    top3 = []
    for r in solver_output.results[:3]:
        top3.append({
            "variant": r["variant"],
            "rank": r.get("rank", 0),
            "score": round(r.get("score", 0), 2),
        })

    return JSONResponse(content={
        "captcha_id": captcha_id,
        "classification": classification.kind,
        "solver": solver_output.solver_name,
        "best_variant": solver_output.best_variant,
        "top3": top3,
    })


@router.get("/tariffs/{api_key_id}")
async def get_admin_tariff(api_key_id: int):
    return _json_result(billing_service.get_tariff(api_key_id))


@router.put("/tariffs/{api_key_id}")
async def create_update_tariff(api_key_id: int, body: TariffBody, request: Request):
    result = billing_service.upsert_tariff(api_key_id, body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "tariff.changed",
            Permission.TARIFF_EDIT,
            target_type="tariff",
            target_id=api_key_id,
        )
    return _json_result(result)


@router.delete("/tariffs/{api_key_id}")
async def delete_admin_tariff(api_key_id: int, request: Request):
    result = billing_service.delete_tariff(api_key_id)
    if result[0] < 400:
        _audit_business_action(
            request,
            "tariff.changed",
            Permission.TARIFF_EDIT,
            target_type="tariff",
            target_id=api_key_id,
            metadata={"deleted": True},
        )
    return _json_result(result)


@router.get("/company-tariffs/{company_id}")
async def get_admin_company_tariff(company_id: int, request: Request):
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is not None and tenant_company_id != company_id:
        return JSONResponse(status_code=403, content={"error": "Forbidden: company scope required"})
    return _json_result(billing_service.get_company_tariff(company_id))


@router.put("/company-tariffs/{company_id}")
async def create_update_company_tariff(company_id: int, body: TariffBody, request: Request):
    system_guard = _require_system_scope(request)
    if system_guard:
        return system_guard
    result = billing_service.upsert_company_tariff(company_id, body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "tariff.changed",
            Permission.TARIFF_EDIT,
            target_type="company_tariff",
            target_id=company_id,
        )
    return _json_result(result)


@router.delete("/company-tariffs/{company_id}")
async def delete_admin_company_tariff(company_id: int, request: Request):
    system_guard = _require_system_scope(request)
    if system_guard:
        return system_guard
    result = billing_service.delete_company_tariff(company_id)
    if result[0] < 400:
        _audit_business_action(
            request,
            "tariff.changed",
            Permission.TARIFF_EDIT,
            target_type="company_tariff",
            target_id=company_id,
            metadata={"deleted": True},
        )
    return _json_result(result)


@router.patch("/api-keys/{id}")
async def update_api_key(id: int, body: UpdateApiKeyBody, request: Request):
    admin_token = token_from_request(request)
    decision = AccessService().authorize_token(admin_token, Permission.ADMIN_USERS_MANAGE)
    return _json_result(billing_service.update_api_key(id, body, access_decision=decision))


@router.patch("/usage-log/{id}")
async def update_admin_usage_log(id: int, body: UpdateUsageLogBody):
    return _json_result(billing_service.update_usage_log(id, body))


@router.post("/generate-invoice")
async def generate_invoice(body: GenerateInvoiceBody, request: Request):
    result = billing_service.generate_invoice(body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "invoice.generated",
            Permission.INVOICE_GENERATE,
            "invoice",
            result[1].get("invoice_id"),
        )
    return _json_result(result)


@router.get("/invoices")
async def list_admin_invoices(request: Request):
    return _json_result(billing_service.list_invoices(_tenant_company_id(request)))


@router.post("/invoices")
async def create_admin_invoice(body: CreateInvoiceBody, request: Request):
    result = billing_service.create_invoice(body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "invoice.generated",
            Permission.BILLING_EDIT,
            "invoice",
            result[1].get("id"),
        )
    return _json_result(result)


@router.patch("/invoices/{id}")
async def update_admin_invoice(id: int, body: UpdateInvoiceBody, request: Request):
    scope_guard = _guard_tenant_invoice_target(request, id)
    if scope_guard:
        return scope_guard
    result = billing_service.update_invoice(id, body)
    if result[0] < 400:
        _audit_business_action(request, "invoice.changed", Permission.BILLING_EDIT, "invoice", id)
    return _json_result(result)


@router.delete("/invoices/{id}")
async def delete_admin_invoice(id: int, request: Request):
    scope_guard = _guard_tenant_invoice_target(request, id)
    if scope_guard:
        return scope_guard
    result = billing_service.delete_invoice(id)
    if result[0] < 400:
        _audit_business_action(
            request,
            "invoice.changed",
            Permission.BILLING_EDIT,
            "invoice",
            id,
            {"deleted": True},
        )
    return _json_result(result)


@router.post("/open-invoices/ensure")
async def ensure_admin_open_invoice(body: OpenInvoiceBody, request: Request):
    scope_guard = _guard_tenant_company_name(request, body.company)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.ensure_open_invoice(body.company))


@router.post("/auto-invoices/open")
async def open_admin_auto_invoice(body: OpenInvoiceBody, request: Request):
    scope_guard = _guard_tenant_company_name(request, body.company)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.ensure_open_invoice(body.company))


@router.post("/open-invoices/issue")
async def issue_admin_open_invoice(body: OpenInvoiceBody, request: Request):
    scope_guard = _guard_tenant_company_name(request, body.company)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.issue_open_invoice(body.company, body.comment))


@router.get("/company-billing-settings")
async def list_admin_company_billing_settings():
    return _json_result(billing_service.list_company_billing_settings())


@router.put("/company-billing-settings/{company}")
async def update_admin_company_billing_settings(company: str, body: CompanyBillingSettingBody):
    return _json_result(billing_service.update_company_billing_settings(company, body))


@router.get("/company-aliases")
async def list_admin_company_aliases():
    return _json_result(billing_service.list_company_aliases())


@router.post("/company-aliases")
async def upsert_admin_company_alias(body: CompanyAliasBody):
    return _json_result(billing_service.upsert_company_alias(body))


@router.delete("/company-aliases/{alias}")
async def delete_admin_company_alias(alias: str):
    return _json_result(billing_service.delete_company_alias(alias))


# ---------------------------------------------------------------------------
# Companies CRUD
# ---------------------------------------------------------------------------


@router.get("/companies")
async def list_admin_companies(request: Request):
    return JSONResponse(content=company_repo.list_companies(_tenant_company_id(request)))


@router.post("/companies")
async def create_admin_company(body: CompanyBody, request: Request):
    system_guard = _require_system_scope(request)
    if system_guard:
        return system_guard
    try:
        c = company_repo.create_company(
            name=body.name,
            aliases=body.aliases,
            notes=body.notes,
        )
        return JSONResponse(
            status_code=201,
            content={k: getattr(c, k) for k in ("id", "name", "aliases", "notes", "created_at")},
        )
    except Exception as exc:
        logger.error("create_company_error name=%r %s", body.name, exc)
        return JSONResponse(status_code=409, content={"error": str(exc)})


@router.put("/companies/{company_id}")
async def update_admin_company(company_id: int, body: UpdateCompanyBody, request: Request):
    system_guard = _require_system_scope(request)
    if system_guard:
        return system_guard
    kwargs = {k: v for k, v in body.model_dump().items() if v is not None}
    c = company_repo.update_company(company_id, **kwargs)
    if not c:
        return JSONResponse(status_code=404, content={"error": "Company not found"})
    return JSONResponse(
        content={k: getattr(c, k) for k in ("id", "name", "aliases", "notes", "created_at", "updated_at")}
    )


@router.delete("/companies/{company_id}")
async def delete_admin_company(company_id: int, request: Request):
    system_guard = _require_system_scope(request)
    if system_guard:
        return system_guard
    ok = company_repo.delete_company(company_id)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "Company not found"})
    return JSONResponse(content={"ok": True})


@router.get("/expenses")
async def list_admin_expenses(request: Request):
    return _json_result(billing_service.list_expenses(_tenant_company_id(request)))


@router.post("/expenses")
async def create_admin_expense(body: CreateExpenseBody):
    return _json_result(billing_service.create_expense(body))


@router.put("/expenses/{id}")
async def update_admin_expense(id: int, body: UpdateExpenseBody):
    return _json_result(billing_service.update_expense(id, body))


@router.delete("/expenses/{id}")
async def delete_admin_expense(id: int):
    return _json_result(billing_service.delete_expense(id))


@router.get("/finance-entries")
async def list_admin_finance_entries(
    company_id: int | None = None,
    usage_log_id: int | None = None,
    invoice_id: int | None = None,
    payout_id: int | None = None,
    kind: str | None = None,
    edit_state: str | None = None,
):
    filters = {
        "company_id": company_id,
        "usage_log_id": usage_log_id,
        "invoice_id": invoice_id,
        "payout_id": payout_id,
        "kind": kind,
        "edit_state": edit_state,
    }
    return _json_result(billing_service.list_finance_entries(filters))


@router.post("/finance-entries")
async def create_admin_finance_entry(body: FinanceEntryBody):
    return _json_result(billing_service.create_finance_entry(body))


@router.put("/finance-entries/{id}")
async def update_admin_finance_entry(id: int, body: UpdateFinanceEntryBody):
    return _json_result(billing_service.update_finance_entry(id, body))


@router.delete("/finance-entries/{id}")
async def delete_admin_finance_entry(id: int):
    return _json_result(billing_service.delete_finance_entry(id))


@router.get("/payouts")
async def list_admin_payouts(request: Request):
    return _json_result(billing_service.list_payouts(_tenant_company_id(request)))


@router.post("/payouts/preview")
async def preview_admin_payout(body: PreviewPayoutBody):
    return _json_result(billing_service.preview_payout(body))


@router.get("/payouts/available")
async def get_available_resources(request: Request):
    return _json_result(billing_service.available_resources(_tenant_company_id(request)))


@router.post("/payouts")
async def create_admin_payout(body: CreatePayoutBody, request: Request):
    result = billing_service.create_payout(body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "payout.changed",
            Permission.BILLING_EDIT,
            "payout",
            result[1].get("id"),
        )
    return _json_result(result)


@router.put("/payouts/{id}")
async def update_admin_payout(id: int, body: UpdatePayoutBody, request: Request):
    result = billing_service.update_payout(id, body)
    if result[0] < 400:
        _audit_business_action(request, "payout.changed", Permission.BILLING_EDIT, "payout", id)
    return _json_result(result)


@router.patch("/payouts/{id}")
async def set_admin_payout_status(id: int, body: SetPayoutStatusBody, request: Request):
    result = billing_service.set_payout_status(id, body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "payout.changed",
            Permission.BILLING_EDIT,
            "payout",
            id,
            {"status": body.status},
        )
    return _json_result(result)


@router.delete("/payouts/{id}")
async def delete_admin_payout(id: int, request: Request):
    result = billing_service.delete_payout(id)
    if result[0] < 400:
        _audit_business_action(
            request,
            "payout.changed",
            Permission.BILLING_EDIT,
            "payout",
            id,
            {"deleted": True},
        )
    return _json_result(result)


@router.post("/payouts/{id}/recalculate")
async def recalculate_admin_payout(id: int, body: CreatePayoutBody, request: Request):
    result = billing_service.recalculate_payout(id, body)
    if result[0] < 400:
        _audit_business_action(
            request,
            "payout.changed",
            Permission.BILLING_EDIT,
            "payout",
            id,
            {"recalculated": True},
        )
    return _json_result(result)


@router.get("/users")
async def list_admin_users(request: Request):
    return _json_result(billing_service.list_users(_tenant_company_id(request)))


@router.get("/users/{id}/stats")
async def get_admin_user_stats(id: int, request: Request):
    target_guard = _guard_tenant_user_target(request, id)
    if target_guard:
        return target_guard
    return _json_result(billing_service.get_user_stats(id))


@router.get("/finance-participants")
async def list_admin_finance_participants(request: Request, company_id: int | None = None):
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is not None and company_id is not None and int(company_id) != tenant_company_id:
        return JSONResponse(status_code=403, content={"error": "Forbidden: company scope required"})
    return _json_result(billing_service.list_finance_participants(company_id or tenant_company_id))


@router.get("/user-company-access")
async def get_admin_user_company_access(user_id: int, request: Request):
    target_guard = _guard_tenant_user_target(request, user_id)
    if target_guard:
        return target_guard
    access = user_company_access_repo.get_user_access(user_id)
    if access is None:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return JSONResponse(content=access)


@router.put("/user-company-access/{user_id}")
async def update_admin_user_company_access(user_id: int, body: UserCompanyAccessBody, request: Request):
    payload = body.model_dump(exclude_none=True)
    scope_guard = _guard_tenant_access_payload(request, user_id, payload)
    if scope_guard:
        return scope_guard
    access = user_company_access_repo.set_user_access(user_id, payload)
    if access is None:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return JSONResponse(content=access)


@router.get("/company-access")
async def get_admin_company_access(company_id: int, request: Request):
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is not None and int(company_id) != tenant_company_id:
        return _forbid_company_scope()
    return JSONResponse(content=user_company_access_repo.get_company_access(company_id))


@router.put("/company-access/{company_id}")
async def update_admin_company_access(company_id: int, body: CompanyAccessBody, request: Request):
    payload = body.model_dump(exclude_none=True)
    all_user_ids: list[int] = []
    for value in payload.values():
        all_user_ids.extend(int(user_id) for user_id in value)
    scope_guard = _guard_tenant_company_users(request, company_id, all_user_ids)
    if scope_guard:
        return scope_guard
    return JSONResponse(content=user_company_access_repo.set_company_access(company_id, payload))


@router.post("/users")
async def create_admin_user(body: CreateUserBody, request: Request):
    scope_guard = _guard_tenant_user_body(request, body, default_company=True)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.create_user(body))


@router.put("/users/{id}")
async def update_admin_user(id: int, body: UpdateUserBody, request: Request):
    target_guard = _guard_tenant_user_target(request, id)
    if target_guard:
        return target_guard
    scope_guard = _guard_tenant_user_body(request, body)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.update_user(id, body))


@router.delete("/users/{id}")
async def delete_admin_user(id: int, request: Request):
    target_guard = _guard_tenant_user_target(request, id)
    if target_guard:
        return target_guard
    return _json_result(billing_service.delete_user(id))


@router.get("/prepaid-packages")
async def list_admin_prepaid_packages(request: Request):
    result = billing_service.list_prepaid_packages()
    tenant_company_id = _tenant_company_id(request)
    if tenant_company_id is not None and result[0] < 400:
        result = (
            result[0],
            [
                package
                for package in result[1]
                if not _guard_tenant_api_key_target(request, package.get("api_key_id"))
            ],
        )
    return _json_result(result)


@router.post("/prepaid-packages")
async def create_admin_prepaid_package(body: CreatePrepaidPackageBody, request: Request):
    scope_guard = _guard_tenant_api_key_target(request, body.api_key_id)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.create_prepaid_package(body))


@router.patch("/prepaid-packages/{id}")
async def update_admin_prepaid_package(id: int, body: UpdatePrepaidPackageBody, request: Request):
    scope_guard = _guard_tenant_prepaid_package_target(request, id)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.update_prepaid_package(id, body))


@router.delete("/prepaid-packages/{id}")
async def delete_admin_prepaid_package(id: int, request: Request):
    scope_guard = _guard_tenant_prepaid_package_target(request, id)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.delete_prepaid_package(id))


@router.post("/prepaid-packages/{id}/top-up")
async def top_up_admin_prepaid_package(id: int, body: TopUpPrepaidPackageBody, request: Request):
    scope_guard = _guard_tenant_prepaid_package_target(request, id)
    if scope_guard:
        return scope_guard
    return _json_result(billing_service.top_up_prepaid_package(id, body))


@router.get("/prepaid-deductions")
async def list_admin_prepaid_deductions(
    package_id: int | None = None, api_key_id: int | None = None
):
    return _json_result(billing_service.list_prepaid_deductions(package_id, api_key_id))


@router.post("/captchas/send-selected")
async def send_selected_captchas(body: SendSelectedCaptchasBody):
    if not body.captcha_ids:
        return JSONResponse(status_code=400, content={"error": "Нет выбранных капч"})
    sent = captcha_service.replay_captchas(body.captcha_ids)
    if sent is None:
        return JSONResponse(status_code=400, content={"error": "Нет активных SSE подключений"})
    return JSONResponse(content={"sent": sent})


@router.post("/captchas/backfill-duration")
async def backfill_captcha_duration(request: Request):
    from src.policies.access_policy import is_admin_token

    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.db.captchas import backfill_duration_ms

    updated = backfill_duration_ms()
    logger.info("backfill_duration_ms updated=%d", updated)
    return JSONResponse(content={"updated": updated})


@router.get("/captchas")
async def list_admin_captchas(
    status: str | None = None,
    api_key_id: int | None = None,
):
    from src.db.captchas import list_captchas

    rows = list_captchas()
    result = []
    for r in rows:
        if status and r["status"] != status:
            continue
        ul = usage_log_repo.get_usage_log(r["usage_log_id"])
        if api_key_id:
            if not ul or ul["api_key_id"] != api_key_id:
                continue
        key_label = None
        if ul:
            key_info = api_key_repo.get_key_by_id(ul["api_key_id"])
            if key_info:
                key_label = key_info.label
        entry = dict(r)
        entry["key_label"] = key_label
        entry["api_key_id"] = ul["api_key_id"] if ul else None
        result.append(entry)
    return JSONResponse(content=result)


@router.get("/captcha-files")
async def list_admin_captcha_files():
    from src.services import captcha_file_service

    captcha_file_service.sync_captcha_files()
    return JSONResponse(content=captcha_file_service.list_captcha_files())


@router.get("/captcha-files/{captcha_id}/thumbnail")
async def admin_captcha_thumbnail(captcha_id: str, mode: str | None = None):
    from src.services import captcha_file_service
    from src.captcha_assembly import get_valid_variant_index, is_icon_click_type

    data = captcha_file_service.load_captcha_payload(captcha_id)
    if data is None:
        return Response(status_code=404, content="Not found")

    if is_icon_click_type(data):
        from src.captcha_solver_engine.images import _clean_b64, _decode_b64_image
        puzzle_data = data.get("puzzle", data)
        main_b64 = puzzle_data.get("imageBase64", "") if isinstance(puzzle_data, dict) else ""
        icons_b64 = puzzle_data.get("iconsBase64", "") if isinstance(puzzle_data, dict) else ""

        main_img = _decode_b64_image(main_b64)
        icons_img = _decode_b64_image(icons_b64)

        if main_img is None:
            return Response(status_code=500, content="Cannot decode main image")

        if icons_img:
            main_w = main_img.width
            icons_h = int(icons_img.height * main_w / icons_img.width) if icons_img.width > 0 else icons_img.height
            icons_img = icons_img.resize((main_w, icons_h), Image.LANCZOS)
            canvas = Image.new("RGBA", (main_w, main_img.height + icons_h), (255, 255, 255, 255))
            canvas.paste(main_img, (0, 0))
            canvas.paste(icons_img, (0, main_img.height))
        else:
            canvas = main_img

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    vi = get_valid_variant_index(data)
    if mode == "solver_top1" and vi is None:
        if captcha_file_service.ensure_analysis_metadata(data):
            source_path = captcha_file_service.captcha_file_path(captcha_id)
            captcha_file_service.write_captcha_json(source_path, data)
            captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
        top3 = data.get("solver_top3")
        if isinstance(top3, list) and top3 and isinstance(top3[0], int):
            vi = top3[0]
    if vi is None:
        return Response(status_code=404, content="No valid_index")

    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    tiles = puzzle.get("tiles", [])

    if vi < 0 or vi >= len(variants):
        return Response(status_code=404, content="Invalid variant index")

    tile_map = {}
    for t in tiles:
        try:
            img = Image.open(io.BytesIO(base64.b64decode(t["imageData"]))).convert("RGBA")
            tile_map[t["tileId"]] = img
        except Exception:
            pass

    tile_ids = variants[vi]
    images = [tile_map[tid] for tid in tile_ids if tid in tile_map]
    if len(images) != len(tile_ids):
        return Response(status_code=500, content="Tile assembly failed")

    w, h = images[0].size
    cols = min(len(images), 3)
    rows = (len(images) + cols - 1) // cols
    canvas = Image.new("RGBA", (w * cols, h * rows), (255, 255, 255, 255))
    for i, img in enumerate(images):
        r = i // cols
        c = i % cols
        canvas.paste(img, (c * w, r * h))

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/captcha-files/backfill-valid-index")
async def admin_backfill_valid_index():
    from src.services import captcha_file_service

    result = captcha_file_service.backfill_valid_index_from_logs()
    return JSONResponse(content=result)


@router.post("/captcha-files/backfill-analysis-metadata")
async def admin_backfill_analysis_metadata():
    from src.services import captcha_file_service

    result = captcha_file_service.backfill_analysis_metadata()
    return JSONResponse(content=result)


@router.post("/captcha-files/backfill-dates")
async def admin_backfill_dates():
    from src.services import captcha_file_service

    result = captcha_file_service.backfill_captcha_dates()
    return JSONResponse(content=result)


@router.post("/captcha-files/sync")
async def admin_sync_captcha_files(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.services import captcha_file_service

    result = captcha_file_service.sync_captcha_files_full()
    return JSONResponse(content=result)


@router.put("/captcha-files/{captcha_id}/classification")
async def admin_set_classification(captcha_id: str, body: dict):
    from fastapi import HTTPException
    from src.repositories import captcha_file_repo

    classification = body.get("classification")
    if classification not in ("digit", "puzzle", "figures", None):
        raise HTTPException(400, "classification must be 'digit', 'puzzle', 'figures', or null")
    ok = captcha_file_repo.update_classification(captcha_id, classification)
    if not ok:
        raise HTTPException(404, "Captcha file not found")
    return JSONResponse(content={"captcha_id": captcha_id, "classification": classification})


@router.get("/ai/models")
async def admin_ai_models():
    """List available trained models."""
    from src.captcha_solver_engine.train import list_models
    return JSONResponse(content=list_models())


@router.get("/ai/runs")
async def admin_ai_runs():
    """Get history of classification runs."""
    from src.db.connection import get_connection
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM classification_runs ORDER BY created_at DESC LIMIT 10"
    ).fetchall()
    conn.close()
    return JSONResponse(content=[dict(r) for r in rows])


@router.post("/ai/classify")
async def admin_ai_classify(body: dict):
    """Run classifier on all captchas, return results with Top-1 previews."""
    from src.services import captcha_file_service
    from src.captcha_solver_engine.classifier import ChainClassifier
    from src.captcha_solver_engine.digit_classifier import DigitCaptchaClassifier
    from src.captcha_solver_engine.figures_classifier import FigureCaptchaClassifier
    from src.captcha_solver_engine.common import build_captcha_context
    from src.captcha_solver_engine.solvers import solver_for_classification
    from src.captcha_assembly import get_valid_variant_index
    from src.db.connection import get_connection
    import time
    import numpy as np

    classifier_type = body.get("classifier", "chain")
    gt_only = body.get("gt_only")

    if classifier_type == "figures":
        clf = FigureCaptchaClassifier()
        model_name = "figures"; model_version = 0
    elif classifier_type == "digits":
        model_name = body.get("model_name", "hog_svm")
        model_version = body.get("model_version", 1)
        from src.captcha_solver_engine import digit_classifier as dc_mod
        from src.captcha_solver_engine.train import MODELS_DIR
        model_path = os.path.join(MODELS_DIR, f"{model_name}_v{model_version}.pkl")
        if os.path.exists(model_path):
            import pickle
            with open(model_path, "rb") as f:
                dc_mod._model_cache = pickle.load(f)
        clf = DigitCaptchaClassifier()
    else:
        clf = ChainClassifier()
        model_name = "chain"; model_version = 0

    captcha_file_service.sync_captcha_files()
    all_files = captcha_file_service.list_captcha_files()

    results = []

    for cf in all_files:
        cid = cf["captcha_id"]

        if gt_only and cf.get("classification") != gt_only:
            continue

        data = captcha_file_service.load_captcha_payload(cid)
        if data is None:
            continue

        context = build_captcha_context(data)

        t0 = time.perf_counter()
        classification = clf.classify(context)
        elapsed = time.perf_counter() - t0

        solver_top1_match = None
        solver_name = None
        if body.get("check_solver"):
            try:
                solver = solver_for_classification(classification)
                solver_output = solver.solve(context, classification, edge_trim=3, verbose=False)
                vi = get_valid_variant_index(data)
                solver_top1_match = (solver_output.best_variant == vi) if vi is not None else None
                solver_name = solver_output.solver_name
            except Exception as e:
                solver_name = f"error: {e}"

        puzzle = data.get("puzzle", data)
        variants = puzzle.get("variantsCapture", [])
        tiles = puzzle.get("tiles", [])
        vi = get_valid_variant_index(data)
        if vi is None:
            top3 = data.get("solver_top3")
            if isinstance(top3, list) and top3 and isinstance(top3[0], int):
                vi = top3[0]

        preview_b64 = None
        if vi is not None and vi < len(variants):
            tile_ids = variants[vi]
            tile_map = {}
            for t in tiles:
                try:
                    img = Image.open(io.BytesIO(base64.b64decode(t["imageData"]))).convert("RGBA")
                    tile_map[t["tileId"]] = img
                except Exception:
                    pass
            images = [tile_map[tid] for tid in tile_ids if tid in tile_map]
            if len(images) == len(tile_ids):
                w, h = images[0].size
                cols = min(len(images), 3)
                rows = (len(images) + cols - 1) // cols
                canvas = Image.new("RGBA", (w * cols, h * rows), (255, 255, 255, 255))
                for i, img in enumerate(images):
                    r = i // cols
                    c = i % cols
                    canvas.paste(img, (c * w, r * h))
                buf = io.BytesIO()
                canvas.save(buf, format="PNG")
                preview_b64 = base64.b64encode(buf.getvalue()).decode()

        results.append({
            "captcha_id": cid,
            "kind": classification.kind,
            "confidence": round(classification.confidence, 3),
            "details": classification.details,
            "time_s": round(elapsed, 4),
            "preview": preview_b64,
            "ground_truth": cf.get("classification"),
            "solver_top1_match": solver_top1_match,
            "solver_name": solver_name,
        })

    digit_count = sum(1 for r in results if r["kind"] == "digit")
    figure_count = sum(1 for r in results if r["kind"] == "figures")
    puzzle_count = sum(1 for r in results if r["kind"] == "default")
    times = [r["time_s"] for r in results]

    tp = fp = fn = tn = 0
    for r in results:
        gt = r["ground_truth"]
        is_digit = r["kind"] == "digit"
        if gt == "digit" and is_digit:
            tp += 1
        elif gt == "digit" and not is_digit:
            fn += 1
        elif gt and gt != "digit" and is_digit:
            fp += 1
        elif gt and gt != "digit" and not is_digit:
            tn += 1

    total_l = tp + tn + fp + fn
    accuracy = (tp + tn) / max(total_l, 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1_val = 2 * precision * recall / max(precision + recall, 0.001) if (precision + recall) > 0 else 0.0

    try:
        conn = get_connection()
        conn.execute(
            """INSERT INTO classification_runs
               (model_name, model_version, total, figure_found, digit_found, puzzle_found,
                true_positives, false_positives, false_negatives, true_negatives,
                accuracy, precision, recall, f1, speed_avg, speed_median,
                solver_top1_hits, solver_top1_total)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (model_name, model_version, len(results), figure_count, digit_count,
             puzzle_count, tp, fp, fn, tn,
             round(accuracy, 4), round(precision, 4), round(recall, 4), round(f1_val, 4),
             round(float(np.mean(times)), 4), round(float(np.median(times)), 4),
             sum(1 for r in results if r.get("solver_top1_match") is True),
             sum(1 for r in results if r.get("solver_top1_match") is not None)),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    return JSONResponse(content={
        "total": len(results),
        "figure_count": figure_count,
        "digit_count": digit_count,
        "puzzle_count": puzzle_count,
        "speed": {
            "avg": round(float(np.mean(times)), 4),
            "median": round(float(np.median(times)), 4),
            "max": round(float(np.max(times)), 4),
        },
        "stats": {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                  "accuracy": round(accuracy, 3), "precision": round(precision, 3),
                  "recall": round(recall, 3), "f1": round(f1_val, 3)},
        "results": results,
    })


@router.post("/slots-group/clear")
async def admin_slots_group_clear():
    from src.services.slots_group_service import clear as slots_clear

    return JSONResponse(content=slots_clear())


@router.get("/stream/slots")
async def admin_slots_stream(request: Request):
    from src.services.slots_group_service import get_events_since, stats
    from src.policies.access_policy import is_admin_token

    token = token_from_request(request)
    if not token or not is_admin_token(token):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    async def event_generator():
        import asyncio
        import time
        import uuid

        stream_id = uuid.uuid4().hex[:8]
        client = request.client.host if request.client else "unknown"
        last_index = 0
        last_heartbeat_at = 0.0
        heartbeat_interval = 15.0
        logger.warning("slots stream open id=%s client=%s", stream_id, client)
        yield "retry: 2000\n\n"
        try:
            while True:
                events, last_index = get_events_since(last_index)
                if events:
                    payload = {
                        "type": "events",
                        "events": events,
                        "stats": stats(),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    last_heartbeat_at = time.monotonic()
                elif time.monotonic() - last_heartbeat_at >= heartbeat_interval:
                    yield f": ping {int(time.time())}\n\n"
                    last_heartbeat_at = time.monotonic()
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.warning("slots stream cancelled id=%s client=%s", stream_id, client)
            raise
        except Exception:
            logger.exception("slots stream crashed id=%s client=%s", stream_id, client)
            raise
        finally:
            logger.warning("slots stream closed id=%s client=%s", stream_id, client)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
