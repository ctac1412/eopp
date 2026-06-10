"""Company billing settings and aliases service."""

from src.entities.utils import entities_to_list, entity_to_dict
from src.repositories import company_billing_repo as company_repo


def list_company_billing_settings() -> tuple[int, list[dict]]:
    return 200, entities_to_list(company_repo.list_company_billing_settings())


def update_company_billing_settings(company: str, body) -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    return 200, entity_to_dict(
        company_repo.upsert_company_billing_settings(company, body.auto_invoice_reopen)
    )


def list_company_aliases() -> tuple[int, list[dict]]:
    return 200, entities_to_list(company_repo.list_company_aliases())


def upsert_company_alias(body) -> tuple[int, dict]:
    if not body.alias.strip():
        return 400, {"error": "alias required"}
    if not body.company.strip():
        return 400, {"error": "company required"}
    return 200, entity_to_dict(company_repo.upsert_company_alias(body.alias, body.company))


def delete_company_alias(alias: str) -> tuple[int, dict]:
    if not alias:
        return 400, {"error": "alias required"}
    if not company_repo.delete_company_alias(alias):
        return 404, {"error": "Company alias not found"}
    return 200, {"ok": True}
