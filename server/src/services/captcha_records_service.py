from src.entities.utils import entities_to_list, entity_to_dict
from src.policies.access_policy import is_admin_token
from src.repositories import captcha_repo, distribution_repo


def list_records(admin_token: str | None, usage_log_id: int | None = None):
    if not is_admin_token(admin_token):
        return 401, {"error": "Unauthorized"}
    records = captcha_repo.list_records(usage_log_id)
    items = entities_to_list(records)
    answers_by_captcha_id = distribution_repo.get_answers_for_captcha_ids(
        [item["captcha_id"] for item in items if item.get("captcha_id")]
    )
    for item in items:
        answers = answers_by_captcha_id.get(item.get("captcha_id"), [])
        item["operator_answers"] = answers
        item["operator_names"] = list(
            dict.fromkeys(
                answer.get("operator_nickname")
                for answer in answers
                if answer.get("operator_nickname")
            )
        )
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
