"""Resolve the plugin/master API key from the shared site session."""

from fastapi import Request
from fastapi.responses import JSONResponse

from src.policies.access_policy import token_from_request
from src.repositories import api_key_repo, user_repo


def key_for_session_request(request: Request, *, enforce_usage_limit: bool = True):
    user = user_repo.get_session_user(token_from_request(request))
    if not user:
        return None, JSONResponse(status_code=401, content={"error": "Unauthorized"})

    key_record = api_key_repo.get_active_key_for_user(user.id)
    if not key_record:
        return None, JSONResponse(status_code=403, content={"error": "No active API key for user"})

    validation = api_key_repo.validate_api_key(key_record.key)
    limit_exceeded = validation.get("reason") == "Maximum uses exceeded"
    if not validation["valid"] and (enforce_usage_limit or not limit_exceeded):
        return None, JSONResponse(
            status_code=403,
            content={"error": "Invalid API key", "reason": validation["reason"]},
        )

    return key_record, None


def with_session_api_key(body, api_key: str):
    if hasattr(body, "model_copy"):
        return body.model_copy(update={"api_key": api_key})
    return body.copy(update={"api_key": api_key})
