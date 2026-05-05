"""
EOPP Captcha Solver - API Routes.

Все API эндпоинты сервера:
- SSE поток (/stream) - push новых капчей
- Решение капч (/solve-captcha, /solve)
- API ключи (/api-keys, /validate-key, /register-usage)
- Логи использования (/usage-log, /confirm-usage, /fail-usage)
- Slots Groups (/slots-group) - координация слотов между клиентами
- Mock EOPP API - мок эндпоинтов для тестирования
- Админ (/admin/auth, /admin/streams, /admin/benchmark)

Регистрирует все роуты через register_all_routes().
Использует models для валидации, api_keys для авторизации, utils для логики.
"""

import asyncio
import json
import os
import random
import threading
import time
import uuid as uuid_module

from fastapi import Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from captcha_solver import solve_captcha
from src.api_keys import (
    confirm_usage,
    create_key,
    delete_key,
    fail_usage,
    get_key_record,
    get_usage_log_entry,
    list_keys,
    list_usages,
    log_usage,
    reset_usage,
    update_key,
    validate_key,
)
from src.constants import (
    ADMIN_TOKEN,
    CAPTCHA_TIMEOUT,
    NO_VALID_DIR,
    PROTECTED_PATHS,
    VALID_DIR,
    write_mode,
)
from src.models import (
    AdminAuthBody,
    ConfirmUsageBody,
    CreateApiKeyBody,
    FailUsageBody,
    GenerateCaptchaBody,
    MockConfigBody,
    RegisterUsageBody,
    SlotsGroupBody,
    SolveCaptchaBody,
    SolveRequest,
    UpdateApiKeyBody,
)
from src.utils import (
    assemble_captchas,
    captcha_hash,
    get_connected_streams,
    get_test_stats,
    get_top3_from_solver,
    lock,
    next_result_id,
    pending,
    push_sse,
    register_sse_connection,
    run_benchmark_cached,
    source_files,
    unregister_sse_connection,
)

# --- Mock config store (Task 3/4) ---
mock_config: dict[str, dict] = {}
mock_config_lock = threading.Lock()
mock_attempt_counters: dict[str, int] = {}

# --- Slots coordination ---
slots_groups: dict[str, dict] = {}
slots_lock = asyncio.Lock()
SLOTS_GROUP_TTL = 60
SLOTS_MASTER_TIMEOUT = 1.5
SLOTS_SLAVE_TIMEOUT = 0.4
MAX_VARIANTS = 8


def admin_auth_middleware_factory(app):
    @app.middleware("http")
    async def admin_auth_middleware(request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in PROTECTED_PATHS):
            token = request.headers.get("X-Admin-Token")
            if not token or token != ADMIN_TOKEN:
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        response = await call_next(request)
        return response

    return admin_auth_middleware


def register_sse_routes(app):
    @app.get("/stream")
    async def sse_stream(request: Request, api_key: str = Query(...)):
        key_record = get_key_record(api_key)
        if not key_record:
            return JSONResponse(status_code=401, content={"error": "Invalid or missing API key"})
        api_key_id = key_record["id"]
        client_ip = request.client.host if request.client else "unknown"

        q, displaced = register_sse_connection(api_key_id, client_ip)

        if displaced:
            unregister_sse_connection(q, api_key_id)

            async def reject_stream():
                yield 'data: {"type": "disconnected", "message": "Другое подключение уже активно"}\n\n'

            return StreamingResponse(
                reject_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )

        async def event_stream():
            try:
                while True:
                    try:
                        item = await asyncio.wait_for(q.get(), timeout=15.0)
                        yield item
                    except TimeoutError:
                        yield ": keepalive\n\n"
            except GeneratorExit:
                pass
            finally:
                unregister_sse_connection(q, api_key_id)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )


def register_captcha_routes(app, captcha_timeout=CAPTCHA_TIMEOUT):
    @app.post("/solve-captcha")
    async def handle_captcha(body: SolveCaptchaBody):
        auto_solve = body.auto_solve
        api_key = body.api_key
        validation = validate_key(api_key)
        if not validation["valid"]:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Invalid API key",
                    "reason": validation["reason"],
                },
            )

        key_record = get_key_record(api_key)
        api_key_id = key_record["id"]

        data = body.model_dump(exclude={"api_key", "auto_solve", "reservation_id"})

        puzzle = data.get("puzzle", data)
        valid_index = data.get("valid_index")
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])

        captcha_id = captcha_hash(data)
        reservation_id = body.reservation_id or "unknown"

        if body.usage_log_id:
            usage_log_id = body.usage_log_id
        else:
            usage_log_id = log_usage(
                api_key=api_key, reservation_id=reservation_id, captcha_id=captcha_id
            )

        has_valid_index = "valid_index" in data
        target_dir = VALID_DIR if has_valid_index else NO_VALID_DIR
        os.makedirs(target_dir, exist_ok=True)
        existing_file = os.path.join(target_dir, f"{captcha_id}.json")
        if not os.path.exists(existing_file):
            with open(existing_file, "w") as f:
                json.dump(data, f, indent=2)
            print(
                f"[{captcha_id}] New captcha saved: {captcha_id}.json -> {os.path.basename(target_dir)}/"
            )

        if auto_solve:
            best_variant, tile_order, results = await asyncio.to_thread(solve_captcha, data)
            print(
                f"[{captcha_id}] Auto-solve: variant {best_variant}, "
                f"score={results[0]['score']:.2f}"
            )
            return JSONResponse(
                content={
                    "variantIndex": best_variant,
                    "variantTiles": tile_order,
                    "usage_log_id": usage_log_id,
                    "captcha_id": captcha_id,
                }
            )

        event = threading.Event()

        generated = await asyncio.to_thread(assemble_captchas, tiles, variants, valid_index)
        top3 = await asyncio.to_thread(get_top3_from_solver, data)

        entry = {
            "captcha_id": captcha_id,
            "variants": variants,
            "images": {str(g["index"]): g["image"] for g in generated},
            "event": event,
            "result": None,
            "source_file": source_files.get(captcha_id),
            "usage_log_id": usage_log_id,
            "api_key_id": api_key_id,
        }

        with lock:
            pending[captcha_id] = entry

        push_sse(
            {
                "type": "new_captcha",
                "captcha_id": captcha_id,
                "images": entry["images"],
                "count": len(entry["images"]),
                "top3": top3,
                "created_at": time.time(),
                "timeout": captcha_timeout,
            },
            api_key_id=api_key_id,
        )

        print(
            f"[{captcha_id}] Waiting for solution ({len(entry['images'])} variants). Top3: {top3}"
        )
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: event.wait(timeout=captcha_timeout)
        )

        if entry["result"] is None:
            print(f"[{captcha_id}] Timeout — no solution received")
            push_sse(
                {
                    "type": "captcha_timeout",
                    "captcha_id": captcha_id,
                },
                api_key_id=api_key_id,
            )

        result = entry["result"]
        with lock:
            pending.pop(captcha_id, None)
        if result:
            result["usage_log_id"] = entry["usage_log_id"]
            result["captcha_id"] = captcha_id
        return JSONResponse(content=result)

    @app.post("/solve")
    async def handle_solve(body: SolveRequest):
        captcha_id = body.captcha_id
        variant_index = body.variantIndex

        with lock:
            entry = pending.get(captcha_id)

        if entry and body.api_key:
            key_record = get_key_record(body.api_key)
            if not key_record or key_record["id"] != entry.get("api_key_id"):
                return JSONResponse(
                    status_code=403,
                    content={"error": "API key does not own this captcha"},
                )

        if entry and body.usage_log_id:
            log_entry = get_usage_log_entry(body.usage_log_id)
            if not log_entry or log_entry["captcha_id"] != captcha_id:
                return JSONResponse(
                    status_code=403,
                    content={"error": "Usage log ID does not match this captcha"},
                )

        result = None
        if entry:
            tile_ids = entry["variants"][variant_index]
            rid = next_result_id()
            result = {
                "variantIndex": variant_index,
                "variantTiles": tile_ids,
            }

            result["resultFile"] = f"captcha_{captcha_id}_{rid:04d}.json"
            entry["result"] = result
            entry["event"].set()
            print(f"[{captcha_id}] -> variantIndex={variant_index}")

            if write_mode and entry.get("source_file"):
                source_path = entry["source_file"]
                with open(source_path) as f:
                    source_data = json.load(f)
                source_data["valid_index"] = variant_index
                new_path = os.path.join(VALID_DIR, f"{captcha_id}.json")
                if os.path.exists(new_path):
                    print(
                        f"  DUPLICATE: {os.path.basename(source_path)} already exists in valid/ as {captcha_id}.json"
                    )
                else:
                    with open(new_path, "w") as f:
                        json.dump(source_data, f, indent=2)
                    os.remove(source_path)
                    print(
                        f"  Saved: {os.path.basename(source_path)} -> valid/{captcha_id}.json (valid_index={variant_index})"
                    )

            push_sse(
                {
                    "type": "captcha_solved",
                    "captcha_id": captcha_id,
                },
                api_key_id=entry.get("api_key_id"),
            )

        if result is None:
            return JSONResponse(
                status_code=404,
                content={"error": f"Captcha {captcha_id} not found or already solved"},
            )
        return JSONResponse(content=result)

    @app.post("/trigger-test")
    async def trigger_test(request: Request):
        from src.utils import send_one_test_captcha

        try:
            body = await request.json()
        except Exception:
            body = {}
        api_key = body.get("api_key")
        reservation_id = body.get("reservation_id")

        if api_key:
            key_record = get_key_record(api_key)
            if not key_record:
                return JSONResponse(status_code=403, content={"error": "Invalid API key"})

        t = threading.Thread(
            target=send_one_test_captcha,
            kwargs={"api_key": api_key, "reservation_id": reservation_id},
            daemon=True,
        )
        t.start()
        return JSONResponse(content={"ok": True})

    @app.post("/broadcast")
    async def handle_broadcast(request: Request):
        data = await request.json()
        push_sse(data)
        return JSONResponse(content={"ok": True})


# --- Task 3/4: Helper to resolve mock response (per-attempt) ---
def _get_mock_response(endpoint: str):
    with mock_config_lock:
        cfg = mock_config.get(endpoint)
        if not cfg:
            return None

        responses = cfg.get("responses")
        if responses is None:
            # Backward compat: old format { "mode": "..." }
            mode = cfg.get("mode")
            if mode:
                responses = [mode]
            else:
                return {"mode": "success"}

        counter = mock_attempt_counters.get(endpoint, 0)
        idx = counter % len(responses)
        mock_attempt_counters[endpoint] = counter + 1

        mode = responses[idx]
        result = {"mode": mode}
        if "custom_body" in cfg:
            result["custom_body"] = cfg["custom_body"]
        return result


def _mock_429():
    return JSONResponse(
        status_code=429,
        content={"error": "Too Many Requests"},
        headers={"Retry-After": "5"},
    )


def _mock_400(body: dict):
    return JSONResponse(status_code=400, content=body)


def _load_random_captcha():
    files = [os.path.join(VALID_DIR, f) for f in os.listdir(VALID_DIR) if f.endswith(".json")]
    if not files:
        return JSONResponse(status_code=500, content={"error": "No test captcha files found"})
    filepath = random.choice(files)
    with open(filepath) as f:
        return json.load(f)


def register_api_key_routes(app):
    @app.post("/api-keys")
    async def create_api_key(body: CreateApiKeyBody):
        record = create_key(body.label, body.max_uses)
        return JSONResponse(content=record)

    @app.get("/api-keys")
    async def list_api_keys():
        keys = list_keys()
        masked = []
        for k in keys:
            key_val = k["key"]
            masked_key = key_val[:4] + "••••" + key_val[-4:]
            masked.append(
                {
                    "id": k["id"],
                    "key": key_val,
                    "masked_key": masked_key,
                    "label": k["label"],
                    "created_at": k["created_at"],
                    "usage_count": k["usage_count"],
                    "max_uses": k["max_uses"],
                    "active": k["active"],
                }
            )
        return JSONResponse(content=masked)

    @app.put("/api-keys/{key_id}")
    async def update_api_key(key_id: int, body: UpdateApiKeyBody):
        record = update_key(
            key_id,
            label=body.label,
            max_uses=body.max_uses,
            active=body.active,
        )
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: int):
        if delete_key(key_id):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=404, content={"error": "Key not found"})

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
            group_key = _get_group_key(facility_id, slot_date)
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

    @app.post("/api-keys/{key_id}/reset-usage")
    async def reset_api_key_usage(key_id: int):
        record = reset_usage(key_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.get("/validate-key")
    async def validate_api_key(api_key: str = Query(...)):
        result = validate_key(key=api_key)
        if result["valid"]:
            key_record = get_key_record(api_key)
            if key_record:
                result["api_key_id"] = key_record["id"]
        return JSONResponse(content=result)

    @app.get("/api-key-status")
    async def api_key_status(key: str = Query(...)):
        result = validate_key(key)
        return JSONResponse(
            content={
                "valid": result["valid"],
                "remaining": result.get("remaining"),
                "label": result.get("label", ""),
            }
        )

    # --- Task 3: Mock config endpoints ---
    @app.post("/mock-config")
    async def set_mock_config(body: MockConfigBody):
        with mock_config_lock:
            mock_config.clear()
            mock_attempt_counters.clear()
            for ep, cfg in body.endpoints.items():
                # Backward compat: { "mode": "429" } → { "responses": ["429"] }
                if "mode" in cfg and "responses" not in cfg:
                    cfg["responses"] = [cfg["mode"]]
                mock_config[ep] = cfg
        return JSONResponse(content={"ok": True, "endpoints": dict(mock_config)})

    @app.get("/mock-config")
    async def get_mock_config():
        with mock_config_lock:
            normalized = {}
            for ep, cfg in mock_config.items():
                if "responses" not in cfg and "mode" in cfg:
                    normalized[ep] = {"responses": [cfg["mode"]]}
                else:
                    normalized[ep] = cfg
            return JSONResponse(
                content={
                    "endpoints": normalized,
                    "counters": dict(mock_attempt_counters),
                }
            )

    @app.delete("/mock-config")
    async def reset_mock_config():
        with mock_config_lock:
            mock_config.clear()
            mock_attempt_counters.clear()
        return JSONResponse(content={"ok": True, "endpoints": {}})

    # --- Mock EOPP endpoints with configurable responses (Task 3) ---
    @app.post("/reservations-api/v1/captcha")
    async def mock_captcha(body: GenerateCaptchaBody):
        cfg = _get_mock_response("/reservations-api/v1/captcha")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get(
                    "custom_body",
                    {"title": "CaptchaGenerationError", "eoppStatus": 40001},
                )
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        data = _load_random_captcha()
        if isinstance(data, JSONResponse):
            return data
        return JSONResponse(content=data)

    @app.post("/reservations-api/v1/captcha-validate")
    async def mock_captcha_validate(request: Request):
        body = await request.json()
        cfg = _get_mock_response("/reservations-api/v1/captcha-validate")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "InvalidCaptcha", "eoppStatus": 40002})
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={
                "successToken": "mock-success-token-" + (body.get("captchaToken", "") or "")[:10],
            }
        )

    @app.get("/reservations-api/v1/timeslot/AvailableSlots")
    async def mock_available_slots(
        facilityId: str = Query(None),
        vehicleId: str = Query(None),
        date: str = Query(None),
        transportType: int = Query(None),
        isCreateReservation: bool = Query(None),
        reservationId: str = Query(None),
    ):
        cfg = _get_mock_response("/reservations-api/v1/timeslot/AvailableSlots")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(cfg.get("custom_body", {"title": "SlotsError", "eoppStatus": 40003}))
        if cfg and cfg.get("mode") == "all_occupied":
            return JSONResponse(
                content={
                    "slots": [
                        {
                            "id": "slot-mock-1",
                            "time": "06:00",
                            "count": 0,
                            "slotCaption": "06:00 - 08:00",
                            "intervalIndex": 1,
                        },
                        {
                            "id": "slot-mock-2",
                            "time": "08:00",
                            "count": 0,
                            "slotCaption": "08:00 - 10:00",
                            "intervalIndex": 2,
                        },
                        {
                            "id": "slot-mock-3",
                            "time": "10:00",
                            "count": 0,
                            "slotCaption": "10:00 - 12:00",
                            "intervalIndex": 3,
                        },
                    ]
                }
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {"slots": []}))
        return JSONResponse(
            content={
                "slots": [
                    {
                        "id": "slot-mock-1",
                        "time": "06:00",
                        "count": 3,
                        "slotCaption": "06:00 - 08:00",
                        "intervalIndex": 1,
                    },
                    {
                        "id": "slot-mock-2",
                        "time": "08:00",
                        "count": 5,
                        "slotCaption": "08:00 - 10:00",
                        "intervalIndex": 2,
                    },
                    {
                        "id": "slot-mock-3",
                        "time": "10:00",
                        "count": 2,
                        "slotCaption": "10:00 - 12:00",
                        "intervalIndex": 3,
                    },
                ]
            }
        )

    @app.post("/reservations-api/v1/Reschedule")
    async def mock_reschedule(request: Request):
        await request.json()
        cfg = _get_mock_response("/reservations-api/v1/Reschedule")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "RescheduleError", "eoppStatus": 40004})
            )
        if cfg and cfg.get("mode") == "all_slots_occupied":
            return _mock_400({"title": "AllSlotsOccupiedOnInterval", "eoppStatus": 40001})
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={
                "title": "RescheduleSuccess",
                "eoppStatus": 20118,
                "isSuccess": True,
            }
        )

    @app.post("/reservations-api/v1/SubmitDraft")
    async def mock_submit_draft(request: Request):
        await request.json()
        cfg = _get_mock_response("/reservations-api/v1/SubmitDraft")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "SubmitDraftError", "eoppStatus": 40005})
            )
        if cfg and cfg.get("mode") == "all_slots_occupied":
            return _mock_400({"title": "AllSlotsOccupiedOnInterval", "eoppStatus": 40001})
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={
                "title": "SubmitReservationSuccess",
                "eoppStatus": 20117,
                "isSuccess": True,
            }
        )


def register_usage_routes(app):
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
            with open(no_valid_file) as f:
                source_data = json.load(f)
            source_data["valid_index"] = variant_index
            with open(valid_file, "w") as f:
                json.dump(source_data, f, indent=2)
            os.remove(no_valid_file)
            print(
                f"[captcha-valid] {captcha_id}.json moved to valid/ (variantIndex={variant_index})"
            )
        except Exception as e:
            print(f"[captcha-valid] Failed to move {captcha_id}: {e}")

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


def register_admin_routes(app):
    @app.post("/admin/auth")
    async def admin_auth(body: AdminAuthBody):
        if body.token == ADMIN_TOKEN:
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    @app.get("/admin/streams")
    async def admin_streams():
        return JSONResponse(content=get_connected_streams())

    @app.get("/admin/test-stats")
    async def admin_test_stats():
        return JSONResponse(content=get_test_stats())

    @app.post("/admin/benchmark")
    async def admin_benchmark():
        return JSONResponse(content=run_benchmark_cached())


def register_frontend_routes(app):
    from fastapi.responses import FileResponse

    from src.constants import FRONTEND_DIST

    if os.path.isdir(FRONTEND_DIST):

        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str = ""):
            if not full_path:
                full_path = "index.html"
            file_path = os.path.join(FRONTEND_DIST, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    else:

        @app.get("/{full_path:path}")
        async def serve_frontend_fallback(full_path: str = ""):
            index_path = os.path.join(FRONTEND_DIST, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return JSONResponse(
                status_code=503,
                content={"error": "Frontend not built. Run: make build-frontend"},
            )


def register_test_pages(app):
    from fastapi.responses import HTMLResponse

    TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }}
    .card {{ background: #fff; border-radius: 12px; padding: 40px 48px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }}
    h1 {{ margin: 0 0 12px; font-size: 22px; }}
    p {{ color: #666; margin: 0; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p>Тестовая страница для инжектора. Нажмите кнопку «Инжектор».</p>
  </div>
</body>
</html>"""

    @app.get("/test-injector/edit")
    async def test_injector_edit():
        return HTMLResponse(TEST_PAGE_HTML.format(title="Тест: Создание брони"))

    @app.get("/test-injector/reschedule")
    async def test_injector_reschedule():
        return HTMLResponse(TEST_PAGE_HTML.format(title="Тест: Перенос брони"))


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


def register_all_routes(app, captcha_timeout=CAPTCHA_TIMEOUT):
    register_sse_routes(app)
    register_captcha_routes(app, captcha_timeout)
    register_api_key_routes(app)
    register_usage_routes(app)
    register_slots_routes(app)
    register_admin_routes(app)
    register_test_pages(app)
    register_frontend_routes(app)
    from src.routes_plugins import register_plugin_routes

    register_plugin_routes(app)
