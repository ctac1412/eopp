from src.entities.utils import entities_to_list, entity_to_dict
from src.policies.access_policy import is_admin_token
from src.repositories import captcha_repo, distribution_repo


def _payload_coordinates(captcha_id: str | None) -> list[dict]:
    if not captcha_id:
        return []

    from src.services import captcha_file_service

    data = captcha_file_service.load_captcha_payload(captcha_id)
    if not isinstance(data, dict):
        return []

    candidates = [data]
    puzzle = data.get("puzzle")
    if isinstance(puzzle, dict):
        candidates.append(puzzle)

    for candidate in candidates:
        coordinates = candidate.get("coordinates")
        if not isinstance(coordinates, list):
            continue
        normalized = []
        for coord in coordinates:
            if not isinstance(coord, dict):
                continue
            x = coord.get("x")
            y = coord.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                normalized.append({"x": x, "y": y})
        if normalized:
            return normalized
    return []


def _executor_click_answers(item: dict) -> list[dict]:
    coordinates = _payload_coordinates(item.get("captcha_id"))
    captcha_id = item.get("captcha_id")
    return [
        {
            "id": f"executor:{captcha_id}:{index}",
            "usage_log_id": item.get("usage_log_id"),
            "captcha_id": captcha_id,
            "operator_id": None,
            "operator_nickname": "Исполнитель",
            "icon_position": index,
            "x": coord["x"],
            "y": coord["y"],
            "duration_ms": None,
            "created_at": item.get("created_at"),
        }
        for index, coord in enumerate(coordinates)
    ]


def _operator_names_with_counts(answers: list[dict]) -> list[str]:
    counts: dict[str, int] = {}
    for answer in answers:
        nickname = answer.get("operator_nickname")
        if not nickname:
            continue
        counts[nickname] = counts.get(nickname, 0) + 1
    return [f"{nickname} ({count})" for nickname, count in counts.items()]


def list_records(admin_token: str | None, usage_log_id: int | None = None):
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    records = captcha_repo.list_records(usage_log_id)
    items = entities_to_list(records)
    answers_by_captcha_id = distribution_repo.get_answers_for_captcha_ids(
        [item["captcha_id"] for item in items if item.get("captcha_id")]
    )
    for item in items:
        item_usage_log_id = item.get("usage_log_id")
        all_answers = answers_by_captcha_id.get(item.get("captcha_id"), [])
        matched_answers = [
            answer
            for answer in all_answers
            if item_usage_log_id is None or answer.get("usage_log_id") == item_usage_log_id
        ]
        answers = matched_answers if matched_answers else all_answers
        if not answers:
            answers = _executor_click_answers(item)
        item["operator_answers"] = answers
        item["operator_names"] = _operator_names_with_counts(answers)
    return 200, items


def get_record(admin_token: str | None, captcha_record_id: int):
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    record = captcha_repo.get_record(captcha_record_id)
    if not record:
        return 404, {"error": "Captcha record not found"}
    return 200, entity_to_dict(record)


def delete_record(admin_token: str | None, captcha_record_id: int):
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    ok = captcha_repo.delete_record(captcha_record_id)
    if not ok:
        return 404, {"error": "Captcha record not found"}
    return 200, {"ok": True}
