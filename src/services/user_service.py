"""User service."""

from src.entities.utils import entities_to_list, entity_to_dict
from src.repositories import user_repo


def list_users() -> tuple[int, list[dict]]:
    return 200, entities_to_list(user_repo.list_users())


def create_user(body) -> tuple[int, dict]:
    return 200, entity_to_dict(user_repo.create_user(body.name))


def update_user(user_id: int, body) -> tuple[int, dict]:
    user = user_repo.update_user(user_id, body.name)
    if not user:
        return 404, {"error": "User not found"}
    return 200, entity_to_dict(user)


def delete_user(user_id: int) -> tuple[int, dict]:
    if not user_repo.delete_user(user_id):
        return 404, {"error": "User not found"}
    return 200, {"ok": True}
