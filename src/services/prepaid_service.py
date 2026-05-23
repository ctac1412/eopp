"""Prepaid package service."""

from src.entities.utils import entities_to_list, entity_to_dict
from src.repositories import prepaid_repo


def list_prepaid_packages() -> tuple[int, list[dict]]:
    return 200, entities_to_list(prepaid_repo.list_prepaid_packages())


def create_prepaid_package(body) -> tuple[int, dict]:
    return 200, entity_to_dict(
        prepaid_repo.create_prepaid_package(body.api_key_id, body.balance_amount, body.active)
    )


def update_prepaid_package(package_id: int, body) -> tuple[int, dict]:
    updated = prepaid_repo.update_prepaid_package(package_id, body.balance_amount, body.active)
    if not updated:
        return 404, {"error": "Prepaid package not found"}
    return 200, entity_to_dict(updated)


def delete_prepaid_package(package_id: int) -> tuple[int, dict]:
    if not prepaid_repo.delete_prepaid_package(package_id):
        return 404, {"error": "Prepaid package not found"}
    return 200, {"ok": True}


def top_up_prepaid_package(package_id: int, body) -> tuple[int, dict]:
    if body.amount <= 0:
        return 400, {"error": "amount must be positive"}
    updated = prepaid_repo.top_up_prepaid_package(package_id, body.amount)
    if not updated:
        return 404, {"error": "Prepaid package not found"}
    return 200, entity_to_dict(updated)


def list_prepaid_deductions(
    package_id: int | None = None, api_key_id: int | None = None
) -> tuple[int, list[dict]]:
    return 200, prepaid_repo.list_prepaid_deductions(package_id=package_id, api_key_id=api_key_id)
