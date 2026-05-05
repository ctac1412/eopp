"""
EOPP Captcha Solver - Captcha Routes

Эндпоинты:
- POST /solve-captcha - отправить капчу на решение
- POST /solve - отправить решение (от UI)
- POST /trigger-test - запустить тестовые капчи
- POST /broadcast - ручной пуш SSE события

Логика:
- Если auto_solve=true - решает автоматически через captcha_solver
- Иначе блокирует до ручного ответа или таймаута
- Сохраняет капчи в файлы (valid/ или no_valid/)
- При write_mode сохраняет ответ обратно в файл
"""

import asyncio
import json
import os
import threading
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from captcha_solver import solve_captcha
from src.api_keys import (
    get_key_record,
    get_usage_log_entry,
    log_usage,
    validate_key,
)
from src.constants import (
    CAPTCHA_TIMEOUT,
    NO_VALID_DIR,
    VALID_DIR,
    write_mode,
)
from src.models import (
    SolveCaptchaBody,
    SolveRequest,
)
from src.utils import (
    assemble_captchas,
    captcha_hash,
    get_top3_from_solver,
    next_result_id,
    push_sse,
    source_files,
    lock,
    pending,
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

        if auto_solve:
            best_variant, tile_order, results = await asyncio.to_thread(solve_captcha, data)
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

        await asyncio.get_event_loop().run_in_executor(
            None, lambda: event.wait(timeout=captcha_timeout)
        )

        if entry["result"] is None:
            push_sse(
                {"type": "captcha_timeout", "captcha_id": captcha_id},
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

            if write_mode and entry.get("source_file"):
                source_path = entry["source_file"]
                with open(source_path, "r") as f:
                    source_data = json.load(f)
                source_data["valid_index"] = variant_index
                new_path = os.path.join(VALID_DIR, f"{captcha_id}.json")
                if not os.path.exists(new_path):
                    with open(new_path, "w") as f:
                        json.dump(source_data, f, indent=2)
                    os.remove(source_path)

            push_sse(
                {"type": "captcha_solved", "captcha_id": captcha_id},
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
