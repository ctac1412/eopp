"""Business guards for plugin launch requests."""

from typing import Any

ZABAIKALSK_FACILITY_ID = "1dae5b1c-e2b3-44a4-848f-df8ce2ddde42"
TEST_FACILITY_ID = "facility-1"
RUN_UP_TO_5_ALLOWED_FACILITY_IDS = {ZABAIKALSK_FACILITY_ID, TEST_FACILITY_ID}


def _get_nested(data: dict[str, Any], *path: str):
    current: Any = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _facility_id(config_json: dict[str, Any]) -> str | None:
    return (
        config_json.get("facilityId")
        or _get_nested(config_json, "reservationData", "raw", "facilityId")
        or _get_nested(config_json, "reservationData", "facilityRaw", "id")
    )


def _facility_label(config_json: dict[str, Any]) -> str:
    return (
        _get_nested(config_json, "reservationData", "facilityRaw", "name")
        or _facility_id(config_json)
        or "не выбран"
    )


def validate_launch_config(config_json: dict[str, Any] | None) -> dict[str, str] | None:
    """Return an error payload when a launch config violates business guards."""

    if not isinstance(config_json, dict):
        return None

    if config_json.get("runUpTo") == 5 and _facility_id(config_json) not in RUN_UP_TO_5_ALLOWED_FACILITY_IDS:
        return {
            "error": "launch_guard_failed",
            "message": (
                "Запуск до этапа 5 разрешен только для АПП Забайкальск. "
                f"Выбран: {_facility_label(config_json)}"
            ),
        }

    return None
