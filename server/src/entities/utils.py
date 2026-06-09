from typing import Any

from src.entities.base import Base


def entity_to_dict(entity: Base) -> dict[str, Any]:
    return {c.name: getattr(entity, c.name) for c in entity.__table__.columns}


def entities_to_list(entities: list[Base]) -> list[dict[str, Any]]:
    return [entity_to_dict(e) for e in entities]
