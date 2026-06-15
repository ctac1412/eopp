"""Company billing settings and aliases service."""

from src.entities.utils import entities_to_list, entity_to_dict
from src.repositories import company_billing_repo as company_repo


def _body_fields(body) -> set[str]:
    fields = getattr(body, "model_fields_set", None)
    if fields is not None:
        return set(fields)
    return set(getattr(body, "__fields_set__", set()))


def list_company_billing_settings() -> tuple[int, list[dict]]:
    return 200, entities_to_list(company_repo.list_company_billing_settings())


def update_company_billing_settings(company: str, body) -> tuple[int, dict]:
    if not company:
        return 400, {"error": "company required"}
    if body.tax_commission_mode not in company_repo.TAX_COMMISSION_MODES:
        return 400, {"error": "Invalid tax_commission_mode"}
    fields = _body_fields(body)
    optional_settings = {}
    for field in [
        "default_percent_rate",
        "default_tax_rate",
        "default_commission_user_id",
        "default_tax_user_id",
    ]:
        if field in fields:
            optional_settings[field] = getattr(body, field)
    return 200, entity_to_dict(
        company_repo.upsert_company_billing_settings(
            company,
            body.auto_invoice_reopen,
            body.tax_commission_mode,
            **optional_settings,
        )
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
