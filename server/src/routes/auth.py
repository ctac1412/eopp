"""Site-wide password session routes.

These endpoints are the common web login surface for the React app. Plugin and
extension traffic continues to authenticate with API keys through the existing
key validation and usage endpoints.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.models import AdminAuthBody
from src.modules.access.permissions import Permission, role_permissions, role_sections
from src.modules.access.service import AccessService
from src.modules.audit.service import AuditService
from src.policies.access_policy import SESSION_COOKIE, token_from_request
from src.repositories import api_key_repo, user_repo

router = APIRouter(prefix="/auth", tags=["auth"])
SESSION_COOKIE_MAX_AGE_SECONDS = user_repo.SESSION_TTL_HOURS * 60 * 60


def _session_payload(user) -> dict:
    return {
        "ok": True,
        "role": user.role,
        "permissions": sorted(permission.value for permission in role_permissions(user.role)),
        "sections": list(role_sections(user.role)),
        "user": user_repo.user_to_dict(user),
    }


def _response_with_session(user) -> JSONResponse:
    token = user_repo.create_session(user.id)
    decision = AccessService().authorize_token(token, Permission.BILLING_VIEW)
    AuditService().record_security(
        "admin.login.succeeded",
        decision=decision,
        metadata={"role": user.role, "source": "password"},
    )
    response = JSONResponse(content=_session_payload(user))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
    )
    return response


def login_response(body: AdminAuthBody) -> JSONResponse:
    """Authenticate a password user and create the shared site session cookie."""

    audit = AuditService()
    if not body.login or not body.password:
        audit.record_security(
            "admin.login.failed",
            metadata={"reason": "missing_credentials", "source": "password"},
        )
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    user = user_repo.authenticate_user(body.login, body.password)
    if not user:
        audit.record_security(
            "admin.login.failed",
            metadata={"reason": "invalid_credentials", "source": "password"},
        )
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return _response_with_session(user)


@router.post("/login")
async def auth_login(body: AdminAuthBody):
    return login_response(body)


@router.get("/me")
async def auth_me(request: Request):
    user = user_repo.get_session_user(token_from_request(request))
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=_session_payload(user))


@router.get("/plugin-keys")
async def auth_plugin_keys(request: Request):
    user = user_repo.get_session_user(token_from_request(request))
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    keys = api_key_repo.list_plugin_keys_for_user(
        user.id,
        user.company_id,
        include_company=user.role in {"super_admin", "administrator", "manager"},
    )
    return JSONResponse(content={"keys": keys})


@router.post("/logout")
async def auth_logout():
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(SESSION_COOKIE)
    return response
