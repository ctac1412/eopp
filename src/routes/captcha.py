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
from src.db import (
    get_key_by_id,
    get_key_record,
    is_super_kiosk_key,
)
from src.constants import (
    CAPTCHA_TIMEOUT,
    NO_VALID_DIR,
    VALID_DIR,
    write_mode,
)
from src.schemas.captcha import SolveCaptchaBody, SolveRequest
from src.services import captcha_service
from src.utils import (
    assemble_captchas,
    captcha_hash,
    get_top3_from_solver,
    get_valid_variant_index,
    next_result_id,
    push_sse,
    source_files,
    lock,
    pending,
    super_kiosk_subscriptions,
)


def register_captcha_routes(app, captcha_timeout=CAPTCHA_TIMEOUT):
    @app.post("/solve-captcha")
    async def handle_captcha(body: SolveCaptchaBody):
        auto_solve = body.auto_solve
        api_key = body.api_key
        key_record = captcha_service.validate_captcha_api_key(api_key)
        if isinstance(key_record, tuple):
            status, content = key_record
            return JSONResponse(
                status_code=status,
                content=content,
            )

        api_key_id = key_record["id"]

        data = body.model_dump(exclude={"api_key", "auto_solve", "reservation_id"})

        puzzle = data.get("puzzle", data)
        valid_index = get_valid_variant_index(data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])

        captcha_id = captcha_hash(data)
        reservation_id = body.reservation_id or "unknown"
        usage_log_id = captcha_service.get_or_create_usage_log(
            body.usage_log_id,
            api_key,
            reservation_id,
            captcha_id,
        )

        has_valid_index = valid_index is not None
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

        owner_info = get_key_by_id(api_key_id)
        owner_label = owner_info["label"] if owner_info else "unknown"

        push_sse(
            {
                "type": "new_captcha",
                "captcha_id": captcha_id,
                "images": entry["images"],
                "count": len(entry["images"]),
                "top3": top3,
                "created_at": time.time(),
                "timeout": captcha_timeout,
                "owner_label": owner_label,
                "owner_api_key_id": api_key_id,
            },
            api_key_id=api_key_id,
        )

        await asyncio.get_event_loop().run_in_executor(
            None, lambda: event.wait(timeout=captcha_timeout)
        )

        if entry["result"] is None:
            push_sse(
                {"type": "captcha_timeout", "captcha_id": captcha_id, "owner_label": owner_label, "owner_api_key_id": api_key_id},
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

        if not entry:
            return JSONResponse(
                status_code=404,
                content={"error": f"Captcha {captcha_id} not found or already solved"},
            )

        if entry["result"] is not None:
            return JSONResponse(
                status_code=200,
                content={"already_solved": True, "captcha_id": captcha_id},
            )

        solver_is_super = False
        solver_label = None
        solved_by_super = False
        if body.api_key:
            key_record = get_key_record(body.api_key)
            if not key_record:
                return JSONResponse(
                    status_code=403,
                    content={"error": "Invalid API key"},
                )
            solver_label = key_record.get("label")
            has_super_flag = key_record.get("is_super_kiosk", False)
            solver_id = key_record["id"]
            is_owning = solver_id == entry.get("api_key_id")
            owner_id = entry.get("api_key_id")

            if not has_super_flag and not is_owning:
                return JSONResponse(
                    status_code=403,
                    content={"error": "API key does not own this captcha"},
                )

            if has_super_flag and not is_owning:
                subs = super_kiosk_subscriptions.get(solver_id)
                if subs is not None and len(subs) > 0 and owner_id not in subs:
                    return JSONResponse(
                        status_code=403,
                        content={"error": "Super kiosk not subscribed to this captcha owner"},
                    )
                solved_by_super = True

        if entry and body.usage_log_id:
            if not captcha_service.verify_usage_log_matches_captcha(body.usage_log_id, captcha_id):
                return JSONResponse(
                    status_code=403,
                    content={"error": "Usage log ID does not match this captcha"},
                )

        tile_ids = entry["variants"][variant_index]
        rid = next_result_id()
        result = {
            "variantIndex": variant_index,
            "variantTiles": tile_ids,
            "solved_by_super": solved_by_super,
            "solver_label": solver_label,
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

        owner_id = entry.get("api_key_id")
        owner_info = get_key_by_id(owner_id)
        owner_label = owner_info["label"] if owner_info else "unknown"

        push_sse(
            {
                "type": "captcha_solved",
                "captcha_id": captcha_id,
                "solved_by_super": solved_by_super,
                "solver_label": solver_label,
                "owner_label": owner_label,
                "owner_api_key_id": owner_id,
            },
            api_key_id=owner_id,
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
        captcha_id = body.get("captcha_id")

        if api_key:
            key_record = get_key_record(api_key)
            if not key_record:
                return JSONResponse(status_code=403, content={"error": "Invalid API key"})

        t = threading.Thread(
            target=send_one_test_captcha,
            kwargs={"api_key": api_key, "reservation_id": reservation_id, "captcha_id": captcha_id},
            daemon=True,
        )
        t.start()
        return JSONResponse(content={"ok": True})

    @app.post("/broadcast")
    async def handle_broadcast(request: Request):
        unauthorized = captcha_service.authorize_broadcast(request.headers.get("X-Admin-Token"))
        if unauthorized:
            status, content = unauthorized
            return JSONResponse(status_code=status, content=content)
        data = await request.json()
        push_sse(data)
        return JSONResponse(content={"ok": True})
