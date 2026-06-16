"""User service."""

from src.repositories import user_repo


def list_users(company_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, user_repo.list_users(company_id)


def create_user(body) -> tuple[int, dict]:
    try:
        user = user_repo.create_user(
            body.name,
            login=body.login,
            password=body.password,
            role=body.role,
            system_role=body.system_role,
            active=body.active,
            is_director=body.is_director,
            is_test=body.is_test,
            company_id=body.company_id,
            company_memberships=body.company_memberships,
            operator_profile=body.operator_profile,
            finance_profile=body.finance_profile,
            finance_access=body.finance_access,
            operator_access=body.operator_access,
            executor_access=body.executor_access,
        )
    except ValueError:
        return 400, {"error": "Unknown role"}
    return 200, user


def update_user(user_id: int, body) -> tuple[int, dict]:
    company_id = (
        body.company_id
        if "company_id" in getattr(body, "model_fields_set", set())
        else user_repo.UNSET
    )
    try:
        system_role = (
            body.system_role
            if "system_role" in getattr(body, "model_fields_set", set())
            else user_repo.UNSET
        )
        user = user_repo.update_user(
            user_id,
            name=body.name,
            login=body.login,
            password=body.password,
            role=body.role,
            system_role=system_role,
            active=body.active,
            is_director=body.is_director,
            is_test=body.is_test,
            company_id=company_id,
            company_memberships=body.company_memberships,
            operator_profile=body.operator_profile,
            finance_profile=body.finance_profile,
            finance_access=body.finance_access,
            operator_access=body.operator_access,
            executor_access=body.executor_access,
        )
    except ValueError:
        return 400, {"error": "Unknown role"}
    if not user:
        return 404, {"error": "User not found"}
    return 200, user


def delete_user(user_id: int) -> tuple[int, dict]:
    if not user_repo.delete_user(user_id):
        return 404, {"error": "User not found"}
    return 200, {"ok": True}


def get_user_stats(user_id: int) -> tuple[int, dict]:
    stats = user_repo.get_user_stats(user_id)
    if not stats:
        return 404, {"error": "User not found"}
    return 200, stats


def list_finance_participants(company_id: int | None = None) -> tuple[int, list[dict]]:
    return 200, user_repo.list_finance_participants(company_id)
