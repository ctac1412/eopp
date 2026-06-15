"""Tariff service."""

from src.entities.utils import entity_to_dict
from src.repositories import company_repo, tariff_repo


def _body_fields(body) -> set[str]:
    fields = getattr(body, "model_fields_set", None)
    if fields is not None:
        return set(fields)
    return set(getattr(body, "__fields_set__", set()))


def get_company_tariff(company_id: int) -> tuple[int, dict]:
    tariff = tariff_repo.get_company_tariff(company_id)
    if not tariff:
        return 404, {"error": "Company tariff not found"}
    return 200, tariff_repo.tariff_to_dict(tariff, source="company", company_id=company_id)


def upsert_company_tariff(company_id: int, body) -> tuple[int, dict]:
    tariff = tariff_repo.upsert_company_tariff(
        company_id,
        body.price_create,
        body.price_reschedule,
        body.price_create_peak,
        body.price_custom_slots,
        body.executor_amount or 0,
        body.operator_amount or 0,
    )
    return 200, tariff_repo.tariff_to_dict(tariff, source="company", company_id=company_id)


def get_default_company_tariff() -> tuple[int, dict]:
    tariff = tariff_repo.get_default_company_tariff()
    if not tariff:
        return 404, {"error": "Default company tariff not found"}
    return 200, tariff_repo.tariff_to_dict(tariff, source="default")


def upsert_default_company_tariff(body) -> tuple[int, dict]:
    fields = _body_fields(body)
    optional_settings = {}
    for field in [
        "tax_commission_mode",
        "default_percent_rate",
        "default_tax_rate",
        "default_commission_user_id",
        "default_tax_user_id",
    ]:
        if field in fields:
            optional_settings[field] = getattr(body, field)
    tariff = tariff_repo.upsert_default_company_tariff(
        body.price_create,
        body.price_reschedule,
        body.price_create_peak,
        body.price_custom_slots,
        body.executor_amount or 0,
        body.operator_amount or 0,
        **optional_settings,
    )
    return 200, tariff_repo.tariff_to_dict(tariff, source="default")


def apply_default_company_tariff(company_id: int) -> tuple[int, dict]:
    tariff = tariff_repo.apply_default_company_tariff(company_id)
    if not tariff:
        return 404, {"error": "Default company tariff not found"}
    company = company_repo.get_company(company_id)
    if company:
        tariff_repo.apply_default_company_billing_settings(company.name)
    return 200, tariff_repo.tariff_to_dict(tariff, source="company", company_id=company_id)


def delete_company_tariff(company_id: int) -> tuple[int, dict]:
    if not tariff_repo.delete_company_tariff(company_id):
        return 404, {"error": "Company tariff not found"}
    return 200, {"ok": True}
