"""
EOPP Captcha Solver - Usage Routes

Эндпоинты логирования использования API:
- POST /register-usage - регистрация начала использования (создаёт Slots Group)
- POST /confirm-usage - подтверждение успешного использования
- POST /fail-usage - отметка неудачного использования
- GET /usage-log - история использования
- DELETE /usage-log/{id} - удаление записи
"""

import json
import os
import time

from fastapi import Query
from fastapi.responses import JSONResponse

from src.api_keys import (
    confirm_usage,
    fail_usage,
    get_key_record,
    get_usage_log_entry,
    log_usage,
    list_usages,
    validate_key,
)
from src.constants import (
    NO_VALID_DIR,
    VALID_DIR,
)
from src.routes.slots import SLOTS_GROUP_TTL
from src.models import (
    ConfirmUsageBody,
    FailUsageBody,
    RegisterUsageBody,
)
from src.routes.slots import (
    MAX_VARIANTS,
    generate_8_variants,
    slots_groups,
    slots_lock,
    _clean_expired_groups,
)
import uuid as uuid_module


def move_captcha_to_valid(captcha_id: str, variant_index: int) -> None:
    if not captcha_id:
        return
    no_valid_file = os.path.join(NO_VALID_DIR, f"{captcha_id}.json")
    if not os.path.exists(no_valid_file):
        return
    valid_file = os.path.join(VALID_DIR, f"{captcha_id}.json")
    if os.path.exists(valid_file):
        return
    try:
        with open(no_valid_file, "r") as f:
            source_data = json.load(f)
        source_data["valid_index"] = variant_index
        with open(valid_file, "w") as f:
            json.dump(source_data, f, indent=2)
        os.remove(no_valid_file)
    except Exception:
        pass


def register_usage_routes(app):
    @app.post("/register-usage")
    async def register_usage(body: RegisterUsageBody):
        validation = validate_key(body.api_key)
        if not validation["valid"]:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})
        usage_log_id = log_usage(
            api_key=body.api_key,
            reservation_id=body.reservation_id,
            captcha_id=body.captcha_id or "unknown",
            config_json=body.config_json,
        )

        facility_id = None
        slot_date = None
        if body.config_json:
            facility_id = body.config_json.get("facilityId")
            slot_date = body.config_json.get("slotDate")

        if facility_id and slot_date:
            group_key = f"{facility_id}:{slot_date}"
            gid = str(uuid_module.uuid4())

            async with slots_lock:
                _clean_expired_groups()
                found_key = None
                for k, v in slots_groups.items():
                    if v["group_key"] == group_key:
                        found_key = k
                        break

                if found_key:
                    group = slots_groups[found_key]
                    group_id = found_key
                    consumer_id = len(group["consumers"])
                    is_master = False
                    group["consumers"].append(
                        {
                            "consumer_id": consumer_id,
                            "api_key": body.api_key,
                            "usage_log_id": usage_log_id,
                            "is_master": False,
                            "my_slots": [],
                            "last_ping": time.time(),
                        }
                    )
                    slots_loaded = group["slots"] is not None
                    if slots_loaded:
                        variant_idx = consumer_id % MAX_VARIANTS
                        my_slots = group["consumers"][-1].get("my_slots", [])
                        if not my_slots and group["slots"]:
                            variants = generate_8_variants(group["slots"])
                            for i, c in enumerate(group["consumers"]):
                                c["my_slots"] = variants[i % MAX_VARIANTS]
                            my_slots = variants[variant_idx]
                        result = {
                            "usage_log_id": usage_log_id,
                            "group_id": group_id,
                            "consumer_id": consumer_id,
                            "is_master": is_master,
                            "slots_loaded": slots_loaded,
                            "my_slots": my_slots,
                        }
                    else:
                        result = {
                            "usage_log_id": usage_log_id,
                            "group_id": group_id,
                            "consumer_id": consumer_id,
                            "is_master": is_master,
                            "slots_loaded": slots_loaded,
                        }
                else:
                    group_id = gid
                    slots_groups[gid] = {
                        "group_id": gid,
                        "group_key": group_key,
                        "facility_id": facility_id,
                        "date": slot_date,
                        "slots": None,
                        "slots_loaded": False,
                        "consumers": [
                            {
                                "consumer_id": 0,
                                "api_key": body.api_key,
                                "usage_log_id": usage_log_id,
                                "is_master": True,
                                "my_slots": [],
                                "last_ping": time.time(),
                            }
                        ],
                        "master_consumer_id": 0,
                        "created_at": time.time(),
                        "expires_at": time.time() + SLOTS_GROUP_TTL,
                    }
                    result = {
                        "usage_log_id": usage_log_id,
                        "group_id": group_id,
                        "consumer_id": 0,
                        "is_master": True,
                        "slots_loaded": False,
                    }

                return JSONResponse(content=result)

        return JSONResponse(content={"usage_log_id": usage_log_id})

    @app.post("/confirm-usage")
    async def handle_confirm_usage(body: ConfirmUsageBody):
        key_record = get_key_record(body.api_key)
        if not key_record:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})
        log_entry = get_usage_log_entry(body.usage_log_id)
        if not log_entry or log_entry["api_key_id"] != key_record["id"]:
            return JSONResponse(status_code=404, content={"error": "Usage log entry not found"})
        if body.captcha_id and body.valid_variant_index is not None:
            move_captcha_to_valid(body.captcha_id, body.valid_variant_index)
        ok = confirm_usage(body.usage_log_id, body.slot_date, body.logs, body.captcha_id)
        if not ok:
            return JSONResponse(status_code=404, content={"error": "Usage log entry not found"})
        return JSONResponse(content={"ok": True})

    @app.delete("/usage-log/{usage_log_id}")
    async def delete_usage_log_entry(usage_log_id: int):
        from src.api_keys import delete_usage_log as _delete_usage_log

        ok = _delete_usage_log(usage_log_id)
        if not ok:
            return JSONResponse(status_code=404, content={"error": "Usage log entry not found"})
        return JSONResponse(content={"ok": True})

    @app.get("/usage-log")
    async def get_usage_log(
        api_key_id: int | None = Query(None),
        api_key: str | None = Query(None),
        hide_test: bool = Query(False),
    ):
        if api_key and api_key_id is None:
            key_record = get_key_record(api_key)
            if key_record:
                api_key_id = key_record["id"]
        records = list_usages(api_key_id)
        if hide_test:
            records = [
                r
                for r in records
                if r.get("reservation_id")
                and not r["reservation_id"].startswith("00000000-0000-0000-0000-000000000000")
            ]
        return JSONResponse(content=records)

    @app.post("/fail-usage")
    async def handle_fail_usage(body: FailUsageBody):
        key_record = get_key_record(body.api_key)
        if not key_record:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})
        log_entry = get_usage_log_entry(body.usage_log_id)
        if not log_entry or log_entry["api_key_id"] != key_record["id"]:
            return JSONResponse(status_code=404, content={"error": "Usage log entry not found"})
        if body.captcha_id and body.valid_variant_index is not None:
            move_captcha_to_valid(body.captcha_id, body.valid_variant_index)
        ok = fail_usage(
            body.usage_log_id,
            body.error_message,
            body.error_stage,
            body.slot_date,
            body.logs,
            body.captcha_id,
        )
        if not ok:
            return JSONResponse(status_code=404, content={"error": "Usage log entry not found"})
        return JSONResponse(content={"ok": True})
