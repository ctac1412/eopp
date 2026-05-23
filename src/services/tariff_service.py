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
            api_key_id, body.price_create, body.price_reschedule, body.price_create_peak
        )
    )


def delete_tariff(api_key_id: int) -> tuple[int, dict]:
    if not tariff_repo.delete_tariff(api_key_id):
        return 404, {"error": "Tariff not found"}
    return 200, {"ok": True}
