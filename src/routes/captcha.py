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
- Сохраняет капчи в единую папку captcha_examples/all/
- При write_mode сохраняет valid_index обратно в файл
"""

import asyncio
import logging
import threading
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from src.models import SolveCaptchaBody, SolveRequest

from captcha_solver import solve_captcha
from src.captcha_assembly import (
    assemble_captchas,
    captcha_hash,
    get_solver_answer_from_metadata,
    get_top3_from_solver,
    get_valid_variant_index,
)
from src.constants import (
    CAPTCHA_TIMEOUT,
)
from src.db import (
    get_key_by_id,
    get_key_record,
)

from src.services import captcha_file_service, captcha_service
from src.sse import lock, pending, push_sse, super_kiosk_subscriptions
from src.test_runner import next_result_id

logger = logging.getLogger("eopp.captcha")


def _ms_since(start: float) -> float:
    return (time.perf_counter() - start) * 1000


def _log_solve_step(
    rid: str,
    captcha_id: str | None,
    step: str,
    start: float,
    level: int = logging.INFO,
    **fields,
) -> None:
    parts = [
        f"rid={rid}",
        f"captcha={captcha_id or '-'}",
        f"step={step}",
        f"duration_ms={_ms_since(start):.1f}",
    ]
    parts.extend(f"{key}={value}" for key, value in fields.items() if value is not None)
    logger.log(level, "solve_captcha %s", " ".join(parts))


def register_captcha_routes(app, captcha_timeout=CAPTCHA_TIMEOUT):
    @app.post("/solve-captcha")
    async def handle_captcha(body: SolveCaptchaBody):
        request_start = time.perf_counter()
        rid = f"usage:{body.usage_log_id}" if body.usage_log_id else "usage:new"
        captcha_id = None
        auto_solve = body.auto_solve
        api_key = body.api_key
        step_start = time.perf_counter()
        key_record = captcha_service.validate_captcha_api_key(api_key)
        if isinstance(key_record, tuple):
            status, content = key_record
            _log_solve_step(
                rid,
                captcha_id,
                "validate_api_key",
                step_start,
                logging.WARNING,
                status=status,
            )
            return JSONResponse(
                status_code=status,
                content=content,
            )
        _log_solve_step(rid, captcha_id, "validate_api_key", step_start)

        api_key_id = key_record.id

        step_start = time.perf_counter()
        data = body.model_dump(
            exclude={"api_key", "auto_solve", "timeout_metadata", "reservation_id"}
        )

        captcha_id = captcha_hash(data)
        _log_solve_step(
            rid,
            captcha_id,
            "prepare_payload",
            step_start,
            auto_solve=auto_solve,
            timeout_metadata=body.timeout_metadata,
        )
        reservation_id = body.reservation_id or "unknown"
        step_start = time.perf_counter()
        usage_log_id = captcha_service.get_or_create_usage_log(
            body.usage_log_id,
            api_key,
            reservation_id,
            captcha_id,
        )
        rid = f"usage:{usage_log_id}"
        _log_solve_step(
            rid,
            captcha_id,
            "usage_log",
            step_start,
            usage_log_id=usage_log_id,
            api_key_id=api_key_id,
        )

        step_start = time.perf_counter()
        save_result = captcha_file_service.save_captcha_payload_detailed(captcha_id, data)
        data = save_result.data
        puzzle = data.get("puzzle", data)
        valid_index = get_valid_variant_index(data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])
        _log_solve_step(
            rid,
            captcha_id,
            "save_payload",
            step_start,
            reused_existing=save_result.reused_existing,
            analysis_changed=save_result.analysis_changed,
            tiles=len(tiles),
            variants=len(variants),
            has_solver_results=isinstance(data.get("solver_results"), list),
        )

        if auto_solve:
            step_start = time.perf_counter()
            solver_answer = get_solver_answer_from_metadata(data)
            if solver_answer is None:
                _log_solve_step(rid, captcha_id, "auto_solve_metadata_miss", step_start)
                step_start = time.perf_counter()
                best_variant, tile_order, results = await asyncio.to_thread(solve_captcha, data)
                _log_solve_step(
                    rid,
                    captcha_id,
                    "auto_solve_calculate",
                    step_start,
                    best_variant=best_variant,
                )
            else:
                best_variant, tile_order, results = solver_answer
                _log_solve_step(
                    rid,
                    captcha_id,
                    "auto_solve_metadata_hit",
                    step_start,
                    best_variant=best_variant,
                )
            _log_solve_step(
                rid,
                captcha_id,
                "finish",
                request_start,
                mode="auto",
                status="success",
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

        step_start = time.perf_counter()
        top3 = get_top3_from_solver(data)
        # Run solver to get real confidence
        confident = False
        try:
            from src.captcha_solver_engine.common import build_captcha_context
            from src.captcha_solver_engine.classifier import classify_captcha
            from src.captcha_solver_engine.solvers import solver_for_classification
            ctx = build_captcha_context(data)
            clf_result = classify_captcha(ctx)
            solver = solver_for_classification(clf_result)
            solver_out = solver.solve(ctx, clf_result, edge_trim=3, verbose=False)
            confident = solver_out.confident
        except Exception:
            pass
        _log_solve_step(rid, captcha_id, "top3", step_start, top3=",".join(top3), confident=confident)
        step_start = time.perf_counter()
        generated = await asyncio.to_thread(assemble_captchas, tiles, variants, valid_index)
        _log_solve_step(
            rid,
            captcha_id,
            "assemble_captchas",
            step_start,
            generated=len(generated),
        )

        entry = {
            "captcha_id": captcha_id,
            "variants": variants,
            "images": {str(g["index"]): g["image"] for g in generated},
            "event": event,
            "result": None,
            "usage_log_id": usage_log_id,
            "api_key_id": api_key_id,
        }

        step_start = time.perf_counter()
        with lock:
            pending[captcha_id] = entry
        _log_solve_step(rid, captcha_id, "pending_store", step_start)

        step_start = time.perf_counter()
        owner_info = get_key_by_id(api_key_id)
        owner_label = owner_info["label"] if owner_info else "unknown"
        _log_solve_step(rid, captcha_id, "owner_lookup", step_start, owner=owner_label)

        step_start = time.perf_counter()
        push_sse(
            {
                "type": "new_captcha",
                "captcha_id": captcha_id,
                "images": entry["images"],
                "count": len(entry["images"]),
                "top3": top3,
                "confident": confident,
                "created_at": time.time(),
                "timeout": captcha_timeout,
                "owner_label": owner_label,
                "owner_api_key_id": api_key_id,
            },
            api_key_id=api_key_id,
        )
        _log_solve_step(rid, captcha_id, "push_sse_new_captcha", step_start)

        step_start = time.perf_counter()
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: event.wait(timeout=captcha_timeout)
        )
        _log_solve_step(
            rid,
            captcha_id,
            "wait_solution",
            step_start,
            solved=entry["result"] is not None,
            timeout=captcha_timeout,
        )

        if entry["result"] is None:
            step_start = time.perf_counter()
            push_sse(
                {
                    "type": "captcha_timeout",
                    "captcha_id": captcha_id,
                    "owner_label": owner_label,
                    "owner_api_key_id": api_key_id,
                },
                api_key_id=api_key_id,
            )
            _log_solve_step(rid, captcha_id, "push_sse_timeout", step_start)
            if body.timeout_metadata:
                entry["result"] = {
                    "status": "timeout",
                    "error": "captcha_timeout",
                    "usage_log_id": entry["usage_log_id"],
                    "captcha_id": captcha_id,
                }

        result = entry["result"]
        step_start = time.perf_counter()
        with lock:
            pending.pop(captcha_id, None)
        _log_solve_step(rid, captcha_id, "pending_cleanup", step_start)
        if result:
            result["usage_log_id"] = entry["usage_log_id"]
            result["captcha_id"] = captcha_id
        _log_solve_step(
            rid,
            captcha_id,
            "finish",
            request_start,
            mode="manual",
            status=result.get("status") if isinstance(result, dict) else "null",
            has_result=result is not None,
        )
        return JSONResponse(content=result)

    @app.post("/solve")
    async def handle_solve(body: SolveRequest):
        request_start = time.perf_counter()
        captcha_id = body.captcha_id
        variant_index = body.variantIndex
        rid = f"usage:{body.usage_log_id}" if body.usage_log_id else "usage:none"

        step_start = time.perf_counter()
        with lock:
            entry = pending.get(captcha_id)
        _log_solve_step(
            rid,
            captcha_id,
            "solve_lookup_pending",
            step_start,
            found=entry is not None,
            variant=variant_index,
        )

        if not entry:
            _log_solve_step(
                rid,
                captcha_id,
                "solve_finish",
                request_start,
                logging.WARNING,
                status=404,
                reason="not_found_or_already_solved",
            )
            return JSONResponse(
                status_code=404,
                content={"error": f"Captcha {captcha_id} not found or already solved"},
            )
        rid = f"usage:{body.usage_log_id or entry.get('usage_log_id') or 'none'}"

        if entry["result"] is not None:
            _log_solve_step(
                rid,
                captcha_id,
                "solve_finish",
                request_start,
                status=200,
                reason="already_solved",
            )
            return JSONResponse(
                status_code=200,
                content={"already_solved": True, "captcha_id": captcha_id},
            )

        solver_label = None
        solved_by_super = False
        if body.api_key:
            step_start = time.perf_counter()
            key_record = get_key_record(body.api_key)
            if not key_record:
                _log_solve_step(
                    rid,
                    captcha_id,
                    "solve_api_key",
                    step_start,
                    logging.WARNING,
                    status=403,
                    reason="invalid_api_key",
                )
                return JSONResponse(
                    status_code=403,
                    content={"error": "Invalid API key"},
                )
            solver_label = key_record.get("label")
            has_super_flag = key_record.get("is_super_kiosk", False)
            solver_id = key_record["id"]
            is_owning = solver_id == entry.get("api_key_id")
            owner_id = entry.get("api_key_id")
            _log_solve_step(
                rid,
                captcha_id,
                "solve_api_key",
                step_start,
                solver_id=solver_id,
                owner_id=owner_id,
                solver_label=solver_label,
                has_super_flag=has_super_flag,
                is_owning=is_owning,
            )

            if not has_super_flag and not is_owning:
                _log_solve_step(
                    rid,
                    captcha_id,
                    "solve_finish",
                    request_start,
                    logging.WARNING,
                    status=403,
                    reason="not_owner",
                    solver_id=solver_id,
                    owner_id=owner_id,
                )
                return JSONResponse(
                    status_code=403,
                    content={"error": "API key does not own this captcha"},
                )

            if has_super_flag and not is_owning:
                subs = super_kiosk_subscriptions.get(solver_id)
                if subs is not None and len(subs) > 0 and owner_id not in subs:
                    _log_solve_step(
                        rid,
                        captcha_id,
                        "solve_finish",
                        request_start,
                        logging.WARNING,
                        status=403,
                        reason="super_not_subscribed",
                        solver_id=solver_id,
                        owner_id=owner_id,
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"error": "Super kiosk not subscribed to this captcha owner"},
                    )
                solved_by_super = True

        if entry and body.usage_log_id:
            step_start = time.perf_counter()
            if not captcha_service.verify_usage_log_matches_captcha(body.usage_log_id, captcha_id):
                _log_solve_step(
                    rid,
                    captcha_id,
                    "solve_usage_log_check",
                    step_start,
                    logging.WARNING,
                    status=403,
                    usage_log_id=body.usage_log_id,
                )
                return JSONResponse(
                    status_code=403,
                    content={"error": "Usage log ID does not match this captcha"},
                )
            _log_solve_step(
                rid,
                captcha_id,
                "solve_usage_log_check",
                step_start,
                usage_log_id=body.usage_log_id,
            )

        step_start = time.perf_counter()
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
        _log_solve_step(
            f"usage:{body.usage_log_id or entry.get('usage_log_id') or 'none'}",
            captcha_id,
            "solve_set_result",
            step_start,
            variant=variant_index,
            result_id=rid,
            solved_by_super=solved_by_super,
            solver_label=solver_label,
        )

        step_start = time.perf_counter()
        owner_id = entry.get("api_key_id")
        owner_info = get_key_by_id(owner_id)
        owner_label = owner_info["label"] if owner_info else "unknown"
        _log_solve_step(
            f"usage:{body.usage_log_id or entry.get('usage_log_id') or 'none'}",
            captcha_id,
            "solve_owner_lookup",
            step_start,
            owner_id=owner_id,
            owner_label=owner_label,
        )

        step_start = time.perf_counter()
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
        _log_solve_step(
            f"usage:{body.usage_log_id or entry.get('usage_log_id') or 'none'}",
            captcha_id,
            "solve_push_sse",
            step_start,
            owner_id=owner_id,
        )

        _log_solve_step(
            f"usage:{body.usage_log_id or entry.get('usage_log_id') or 'none'}",
            captcha_id,
            "solve_finish",
            request_start,
            status=200,
            variant=variant_index,
            solved_by_super=solved_by_super,
        )
        return JSONResponse(content=result)

    @app.post("/trigger-test")
    async def trigger_test(request: Request):
        from src.test_runner import send_one_test_captcha

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
