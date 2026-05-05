"""
EOPP Captcha Solver - Slots Routes

Эндпоинты координации слотов между клиентами:
- POST /slots-group - загрузить слоты (для мастер-клиента)
- GET /slots-group - получить слоты группы

Концепция:
- Master клиент загружает слоты первым
- Slaves получают те же слоты с вариантами распределения
- 8 вариантов (MAX_VARIANTS) для распределения top-3 слотов
- TTL: 60 секунд на группу
- Таймауты: master=1.5s, slave=0.4s
"""

import asyncio
import time

from fastapi import Query
from fastapi.responses import JSONResponse

from src.api_keys import validate_key
from src.models import SlotsGroupBody

# Global state
slots_groups: dict[str, dict] = {}
slots_lock = asyncio.Lock()
SLOTS_GROUP_TTL = 60
SLOTS_MASTER_TIMEOUT = 1.5
SLOTS_SLAVE_TIMEOUT = 0.4
MAX_VARIANTS = 8


def _get_group_key(facility_id: str, date: str) -> str:
    return f"{facility_id}:{date}"


def _clean_expired_groups() -> None:
    now = time.time()
    expired = [k for k, v in slots_groups.items() if v.get("expires_at", 0) < now]
    for k in expired:
        del slots_groups[k]


def _is_consumer_alive(group: dict, consumer_id: int) -> bool:
    for c in group["consumers"]:
        if c["consumer_id"] == consumer_id:
            last_ping = c.get("last_ping")
            if last_ping is None:
                return True
            timeout = (
                SLOTS_MASTER_TIMEOUT
                if c["consumer_id"] == group["master_consumer_id"]
                else SLOTS_SLAVE_TIMEOUT
            )
            return (time.time() - last_ping) < timeout
    return False


def generate_8_variants(all_slots: list[dict]) -> list[list[dict]]:
    sorted_slots = sorted(all_slots, key=lambda s: (-s["count"], s["intervalIndex"]))
    variants = []
    for v in range(MAX_VARIANTS):
        top3_indices = []
        for step in range(3):
            idx = v + step * 8
            if idx < len(sorted_slots):
                top3_indices.append(idx)
        top3 = [sorted_slots[idx] for idx in top3_indices]
        top3_ids = {s["id"] for s in top3}
        rest = [s for s in sorted_slots if s["id"] not in top3_ids]
        variants.append(top3 + rest)
    return variants


def _find_and_assign_new_master(group: dict, requesting_consumer_id: int) -> bool:
    now = time.time()
    master = None
    for c in group["consumers"]:
        if c["consumer_id"] == group["master_consumer_id"]:
            master = c
            break
    if master is None:
        return False
    last_ping = master.get("last_ping", now)
    if (now - last_ping) < SLOTS_MASTER_TIMEOUT:
        return False
    if group["slots"] is not None:
        return False
    for c in group["consumers"]:
        if (
            c["consumer_id"] == requesting_consumer_id
            and c["consumer_id"] != group["master_consumer_id"]
        ):
            old_master_id = group["master_consumer_id"]
            group["master_consumer_id"] = c["consumer_id"]
            c["is_master"] = True
            c["last_ping"] = now
            for cc in group["consumers"]:
                if cc["consumer_id"] == old_master_id:
                    cc["is_master"] = False
            group["expires_at"] = now + SLOTS_GROUP_TTL
            return True
    return False


def register_slots_routes(app):
    @app.post("/slots-group")
    async def slots_group_post(body: SlotsGroupBody):
        validation = validate_key(body.api_key)
        if not validation["valid"]:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})

        async with slots_lock:
            _clean_expired_groups()
            group = slots_groups.get(body.group_id)
            if not group:
                return JSONResponse(status_code=404, content={"error": "Group not found"})

            consumer = None
            for c in group["consumers"]:
                if c["consumer_id"] == body.consumer_id:
                    consumer = c
                    break
            if not consumer:
                return JSONResponse(status_code=404, content={"error": "Consumer not found"})

            if consumer["api_key"] != body.api_key:
                return JSONResponse(status_code=403, content={"error": "API key mismatch"})

            consumer["last_ping"] = time.time()
            group["expires_at"] = time.time() + SLOTS_GROUP_TTL

            if body.slots:
                if not consumer.get("is_master", False):
                    return JSONResponse(
                        status_code=403,
                        content={"error": "Only master can submit slots"},
                    )
                if group["slots"] is not None:
                    return JSONResponse(
                        content={
                            "ok": True,
                            "my_slots": consumer.get("my_slots", []),
                            "total_consumers": len(group["consumers"]),
                        }
                    )

                group["slots"] = body.slots
                variants = generate_8_variants(body.slots)
                for c in group["consumers"]:
                    variant_idx = c["consumer_id"] % MAX_VARIANTS
                    c["my_slots"] = variants[variant_idx]
                group["slots_loaded"] = True

                my_slots = consumer["my_slots"]
                total = len(group["consumers"])

            else:
                my_slots = consumer.get("my_slots", [])
                total = len(group["consumers"])

        return JSONResponse(content={"ok": True, "my_slots": my_slots, "total_consumers": total})

    @app.get("/slots-group")
    async def slots_group_get(
        group_id: str = Query(...),
        consumer_id: int = Query(..., ge=0),
    ):
        async with slots_lock:
            _clean_expired_groups()
            group = slots_groups.get(group_id)
            if not group:
                return JSONResponse(status_code=404, content={"error": "Group not found"})

            consumer = None
            for c in group["consumers"]:
                if c["consumer_id"] == consumer_id:
                    consumer = c
                    break
            if not consumer:
                return JSONResponse(status_code=404, content={"error": "Consumer not found"})

            consumer["last_ping"] = time.time()
            group["expires_at"] = time.time() + SLOTS_GROUP_TTL

            is_master = consumer["consumer_id"] == group["master_consumer_id"]
            master_alive = _is_consumer_alive(group, group["master_consumer_id"])
            slots_loaded = group["slots"] is not None
            my_slots = consumer.get("my_slots", [])
            you_are_master = False

            if not is_master and not master_alive and not slots_loaded:
                if _find_and_assign_new_master(group, consumer_id):
                    you_are_master = True
                    is_master = True
                    master_alive = True

        return JSONResponse(
            content={
                "group_id": group_id,
                "consumer_id": consumer_id,
                "is_master": is_master,
                "slots_loaded": slots_loaded,
                "master_alive": master_alive,
                "you_are_master": you_are_master,
                "my_slots": my_slots,
                "total_consumers": len(group["consumers"]),
            }
        )
