"""Tariff service."""

from src.entities.utils import entity_to_dict
from src.repositories import tariff_repo


def get_tariff(api_key_id: int) -> tuple[int, dict]:
    tariff = tariff_repo.get_tariff(api_key_id)
    if not tariff:
        return 404, {"error": "Tariff not found"}
    return 200, entity_to_dict(tariff)


def upsert_tariff(api_key_id: int, body) -> tuple[int, dict]:
    return 200, entity_to_dict(
        tariff_repo.upsert_tariff(
            api_key_id, body.price_create, body.price_reschedule,
            body.price_create_peak, body.price_custom_slots,
        )
    )


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
    tariff = tariff_repo.upsert_default_company_tariff(
        body.price_create,
        body.price_reschedule,
        body.price_create_peak,
        body.price_custom_slots,
        body.executor_amount or 0,
        body.operator_amount or 0,
    )
    return 200, tariff_repo.tariff_to_dict(tariff, source="default")


def apply_default_company_tariff(company_id: int) -> tuple[int, dict]:
    tariff = tariff_repo.apply_default_company_tariff(company_id)
    if not tariff:
        return 404, {"error": "Default company tariff not found"}
    return 200, tariff_repo.tariff_to_dict(tariff, source="company", company_id=company_id)


def delete_company_tariff(company_id: int) -> tuple[int, dict]:
    if not tariff_repo.delete_company_tariff(company_id):
        return 404, {"error": "Company tariff not found"}
    return 200, {"ok": True}


def delete_tariff(api_key_id: int) -> tuple[int, dict]:
    if not tariff_repo.delete_tariff(api_key_id):
        return 404, {"error": "Tariff not found"}
    return 200, {"ok": True}
