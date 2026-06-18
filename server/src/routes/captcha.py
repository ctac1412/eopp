"""Captcha HTTP adapters."""

import logging
import time

from captcha_solver import solve_captcha
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.captcha_assembly import assemble_captchas, captcha_hash
from src.captcha_test_driver import next_result_id
from src.constants import (
    AUTO_SOLVER_ORDER,
    CAPTCHA_TIMEOUT,
    DISTRIBUTION,
    sync_side_work_enabled,
)
from src.core.captcha_runtime import (
    CaptchaPresentation,
    CaptchaRuntime,
    CaptchaRuntimeDependencies,
    CaptchaSession,
    CaptchaSessionStore,
)
from src.core.captcha_runtime.display_payload import build_new_captcha_message
from src.db import get_key_by_id, get_key_record
from src.models import SolveCaptchaBody, SolveRequest
from src.platform.jobs.queue import enqueue_deferred_job
from src.platform.observability import metrics
from src.services import captcha_file_service, captcha_service
from src.services.session_api_key import key_for_session_request, with_session_api_key
from src.services.top3_service import top3_process_pool
from src.sse import lock, pending, push_sse, super_kiosk_subscriptions

logger = logging.getLogger("eopp.captcha")
router = APIRouter(tags=["captcha"])
captcha_timeout = CAPTCHA_TIMEOUT
_session_store = CaptchaSessionStore(pending, lock)


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
    duration_ms = _ms_since(start)
    metrics.observe_latency_ms(f"solve_captcha.{step}", duration_ms)
    parts = [
        f"rid={rid}",
        f"captcha={captcha_id or '-'}",
        f"step={step}",
        f"duration_ms={duration_ms:.1f}",
    ]
    parts.extend(f"{key}={value}" for key, value in fields.items() if value is not None)
    logger.log(level, "solve_captcha %s", " ".join(parts))


async def _publish_core_event(event) -> None:
    logger.debug("captcha_core_event type=%s data=%s", event.__class__.__name__, event)


def _owner_label(api_key_id: int | None) -> str:
    """Best-effort owner label lookup for display metadata.

    Captcha dispatch must continue even if an adjacent API-key repository or
    migration is temporarily unavailable, so label enrichment never raises back
    into the protected solve flow.
    """

    if api_key_id is None:
        return "unknown"
    try:
        owner_info = get_key_by_id(api_key_id)
    except Exception:
        logger.exception("owner_label_lookup_failed api_key_id=%s", api_key_id)
        return "unknown"
    return owner_info["label"] if owner_info else "unknown"


def _save_payload(captcha_id: str, data: dict):
    return captcha_file_service.save_captcha_payload_detailed(captcha_id, data)


def _sync_solver_metadata() -> bool:
    return sync_side_work_enabled("CAPTCHA_SYNC_SOLVER_METADATA_ENABLED")


def _enqueue_metadata(captcha_id: str, reason: str) -> None:
    try:
        enqueue_deferred_job("captcha_metadata", {"captcha_id": captcha_id, "reason": reason})
    except Exception:
        logger.exception("failed to enqueue captcha_metadata captcha=%s", captcha_id)


def _prepare_display_metadata(
    *,
    session: CaptchaSession,
    data: dict,
    owner_label: str,
    is_distributed: bool,
    metadata: dict,
) -> dict | None:
    if session.captcha_type == 1 or not session.variants or session.api_key_id is None:
        return None

    from src.routes.distribution import init_puzzle_distribution_state
    from src.sse.manager import get_master_operators, operator_api_key_id

    extra_sse = []
    op_ids = get_master_operators(session.api_key_id)
    if not op_ids:
        return None

    operator_id_map = {index + 1: op_id for index, op_id in enumerate(op_ids)}
    init_puzzle_distribution_state(
        captcha_id=session.captcha_id,
        event=session.event,
        usage_log_id=session.usage_log_id,
        api_key_id=session.api_key_id,
        variants=session.variants,
        captcha_data=data,
        operator_id_map=operator_id_map,
    )

    for index, op_id in enumerate(op_ids):
        operator_slot_id = index + 1
        extra_sse.append(
            (
                build_new_captcha_message(
                    session,
                    timeout=captcha_timeout,
                    owner_label=owner_label,
                    owner_api_key_id=session.api_key_id,
                    extra={"distribution": {"operator_id": operator_slot_id}},
                ).to_dict(),
                operator_api_key_id(op_id),
            )
        )
    return {"extra_sse": extra_sse} if extra_sse else None


def _cleanup_puzzle_distribution_state(captcha_id: str | None) -> None:
    if not captcha_id:
        return
    from src.routes.distribution import distribution_states

    state = distribution_states.get(captcha_id)
    if state and state.get("kind") == "puzzle":
        distribution_states.pop(captcha_id, None)


def _runtime() -> CaptchaRuntime:
    deps = CaptchaRuntimeDependencies(
        validate_api_key=captcha_service.validate_captcha_api_key,
        get_or_create_usage_log=captcha_service.get_or_create_usage_log,
        save_captcha_payload=_save_payload,
        captcha_hash=captcha_hash,
        assemble_captchas=assemble_captchas,
        push_sse=push_sse,
        get_owner_label=_owner_label,
        next_result_id=next_result_id,
        captcha_timeout=captcha_timeout,
        get_key_record=get_key_record,
        verify_usage_log_matches_captcha=captcha_service.verify_usage_log_matches_captcha,
        get_super_subscriptions=lambda solver_id: super_kiosk_subscriptions.get(solver_id),
        prepare_icon_session=_prepare_icon_session,
        on_timeout=_on_timeout,
        auto_solve=solve_captcha,
        get_top3=top3_process_pool.get_top3,
        sync_solver_metadata=_sync_solver_metadata,
        enqueue_metadata=_enqueue_metadata,
        prepare_display_metadata=_prepare_display_metadata,
        publish_event=_publish_core_event,
        log_step=_log_solve_step,
    )
    return CaptchaRuntime(deps, _session_store)


@router.post("/solve-captcha")
async def handle_captcha(body: SolveCaptchaBody, request: Request):
    key_record, error = key_for_session_request(request)
    if error:
        return error
    if body.api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body = with_session_api_key(body, key_record.key)
    metrics.counter_inc("captcha_solve_requests_total")
    status, content = await _runtime().handle_captcha(body)
    return JSONResponse(status_code=status, content=content)


@router.post("/solve")
async def handle_solve(body: SolveRequest, request: Request):
    key_record, error = key_for_session_request(request, enforce_usage_limit=False)
    if error:
        return error
    if body.api_key:
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body = with_session_api_key(body, key_record.key)
    status, content = await _runtime().submit_solution(body)
    if status == 200 and content and not content.get("already_solved"):
        _cleanup_puzzle_distribution_state(body.captcha_id)
    return JSONResponse(status_code=status, content=content)


@router.post("/cancel-captcha")
async def handle_cancel_captcha(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    key_record, error = key_for_session_request(request)
    if error:
        return error
    if body.get("api_key"):
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    body["api_key"] = key_record.key
    status, content = await _runtime().cancel_captcha(body)
    return JSONResponse(status_code=status, content=content)


async def _prepare_icon_session(
    *,
    captcha_id: str,
    data: dict,
    usage_log_id: int,
    api_key_id: int,
    event,
    auto_solve_rucaptcha: bool = False,
) -> CaptchaPresentation:
    from src.captcha_solver_engine.images import (
        assemble_icon_click_preview,
        prepare_distribution_icons,
    )
    from src.routes.distribution import build_icon_order, init_distribution_state, make_all_icons
    from src.routes.operator import get_operator_slot_order
    from src.sse.manager import (
        get_master_operators,
        get_operator_display_modes,
        operator_api_key_id,
    )

    puzzle_data = data.get("puzzle", data)
    main_b64 = puzzle_data.get("imageBase64", "") if isinstance(puzzle_data, dict) else ""
    icons_b64 = puzzle_data.get("iconsBase64", "") if isinstance(puzzle_data, dict) else ""
    op_ids = get_operator_slot_order(api_key_id) or get_master_operators(api_key_id)
    icons_cache = {}
    num_operators = 1 + len(op_ids)
    operator_id_map = {0: 0}
    is_distributed = False
    generated = []
    metadata = {"extra_sse": []}

    try:
        import asyncio

        icons_cache = await asyncio.to_thread(prepare_distribution_icons, main_b64, icons_b64)
    except Exception:
        icons_cache = {}

    if op_ids and len(icons_cache) == 5 and num_operators in DISTRIBUTION:
        try:
            is_distributed = True
            for idx, real_id in enumerate(op_ids):
                operator_id_map[idx + 1] = real_id

            operator_display_modes = get_operator_display_modes(op_ids)

            init_distribution_state(
                captcha_id=captcha_id,
                event=event,
                usage_log_id=usage_log_id,
                api_key_id=api_key_id,
                num_operators=num_operators,
                icons_cache=icons_cache,
                captcha_data=data,
                operator_id_map=operator_id_map,
                operator_display_modes=operator_display_modes,
            )
        except Exception as exc:
            logger.warning("distribution_init_failed captcha=%s error=%s", captcha_id, exc)
            is_distributed = False

    if len(icons_cache) == 5 and num_operators in AUTO_SOLVER_ORDER and auto_solve_rucaptcha:
        if not is_distributed:
            init_distribution_state(
                captcha_id=captcha_id,
                event=event,
                usage_log_id=usage_log_id,
                api_key_id=api_key_id,
                num_operators=1,
                icons_cache=icons_cache,
                captcha_data=data,
                operator_id_map={0: 0},
            )
            is_distributed = True
        from src.auto_operator import dispatch_auto_solve

        dispatch_auto_solve(
            captcha_id=captcha_id,
            num_operators=num_operators,
            icons_cache=icons_cache,
        )

    if not is_distributed:
        try:
            import asyncio

            generated = await asyncio.to_thread(assemble_icon_click_preview, main_b64, icons_b64)
        except Exception as exc:
            logger.warning("assemble_icon_click_failed captcha=%s error=%s", captcha_id, exc)
            generated = []

        session = CaptchaSession(
            captcha_id=captcha_id,
            captcha_type=1,
            variants=[],
            images={str(item["index"]): item["image"] for item in generated},
            icons_image=generated[0].get("icons", "") if generated else "",
            event=event,
            result=None,
            usage_log_id=usage_log_id,
            api_key_id=api_key_id,
        )
        return CaptchaPresentation(session=session, is_icon_click=True, metadata=metadata)

    dist_assignments = DISTRIBUTION[num_operators]
    first_pos = dist_assignments.get("0", [0])[0] if dist_assignments.get("0") else 0
    first_icon = icons_cache.get(first_pos, {})
    session = CaptchaSession(
        captcha_id=captcha_id,
        captcha_type=1,
        variants=[],
        images={str(0): main_b64},
        icons_image=first_icon.get("icon", ""),
        event=event,
        result=None,
        usage_log_id=usage_log_id,
        api_key_id=api_key_id,
        distribution={
            "operator_id": 0,
            "assigned": dist_assignments.get("0", []),
            "num_operators": num_operators,
            "connected_operators": len(op_ids),
        },
        icons_cache=icons_cache,
    )
    metadata["sse_extra"] = {"all_icons": make_all_icons(icons_cache, build_icon_order(0, num_operators))}

    owner_label = _owner_label(api_key_id)
    for op_id_str, assigned in dist_assignments.items():
        op_id = int(op_id_str)
        if op_id == 0:
            continue
        op_real_id = operator_id_map.get(op_id)
        if op_real_id is None:
            continue
        first_icon = icons_cache.get(assigned[0], {})
        metadata["extra_sse"].append(
            (
                build_new_captcha_message(
                    {
                        "captcha_id": captcha_id,
                        "captcha_type": 1,
                        "images": {str(0): main_b64},
                        "icons_image": first_icon.get("icon", ""),
                        "distribution": {
                            "operator_id": op_id,
                            "assigned": assigned,
                            "num_operators": num_operators,
                        },
                    },
                    timeout=captcha_timeout,
                    owner_label=owner_label,
                    owner_api_key_id=api_key_id,
                    extra={"all_icons": make_all_icons(icons_cache, build_icon_order(op_id, num_operators))},
                ).to_dict(),
                operator_api_key_id(op_real_id),
            )
        )

    return CaptchaPresentation(
        session=session,
        is_icon_click=True,
        is_distributed=True,
        metadata=metadata,
    )


async def _on_timeout(
    captcha_id: str,
    api_key_id: int | None,
    usage_log_id: int | None,
    timeout_event: dict,
) -> None:
    from src.auto_operator import cancel_auto_solve
    from src.routes.distribution import distribution_states
    from src.sse.manager import (
        get_master_operators,
        operator_api_key_id,
        push_sse,
        push_sse_owner_and_operators,
    )

    state = distribution_states.get(captcha_id)
    if state:
        async with state["lock"]:
            distribution_states.pop(captcha_id, None)
    cancel_auto_solve(captcha_id)
    if api_key_id is not None and timeout_event.get("owner_notified"):
        for op_id in get_master_operators(api_key_id):
            push_sse(timeout_event, api_key_id=operator_api_key_id(op_id))
    elif api_key_id is not None:
        push_sse_owner_and_operators(timeout_event, api_key_id)


@router.post("/trigger-test")
async def trigger_test(request: Request):
    from src.captcha_test_driver import send_one_test_captcha
    from src.policies.access_policy import token_from_request

    key_record, error = key_for_session_request(request)
    if error:
        return error
    session_token = token_from_request(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    if body.get("api_key"):
        return JSONResponse(status_code=400, content={"error": "api_key is no longer accepted"})
    api_key = key_record.key
    reservation_id = body.get("reservation_id")
    captcha_id = body.get("captcha_id")
    course_id = body.get("course_id")
    count = body.get("count", 1)
    test_no_timeout = body.get("test_no_timeout", False)
    auto_solve_rucaptcha = body.get("auto_solve_rucaptcha", False)

    captcha_ids = []

    if course_id:
        from src.repositories import course_repo

        try:
            course = course_repo.get_course(int(course_id))
        except (ValueError, TypeError):
            return JSONResponse(status_code=400, content={"error": "Invalid course_id"})
        if not course:
            return JSONResponse(status_code=404, content={"error": "Course not found"})
        captcha_ids = [c["captcha_id"] for c in course.get("captchas", [])]
        if not captcha_ids:
            return JSONResponse(status_code=400, content={"error": "Course has no captchas"})
        count = len(captcha_ids)

    import asyncio
    import threading

    for i in range(min(count, 50)):
        cid = captcha_ids[i] if captcha_ids else (captcha_id if i == 0 else None)
        interval = 0.15 if course_id else 0.3
        thread = threading.Thread(
            target=send_one_test_captcha,
            kwargs={
                "api_key": api_key,
                "reservation_id": reservation_id,
                "captcha_id": cid,
                "test_no_timeout": test_no_timeout,
                "auto_solve_rucaptcha": auto_solve_rucaptcha,
                "session_token": session_token,
            },
            daemon=True,
        )
        thread.start()
        if count > 1:
            await asyncio.sleep(interval)
    return JSONResponse(content={"ok": True, "sent": count})


@router.post("/broadcast")
async def handle_broadcast(request: Request):
    from src.policies.access_policy import token_from_request

    unauthorized = captcha_service.authorize_broadcast(token_from_request(request))
    if unauthorized:
        status, content = unauthorized
        return JSONResponse(status_code=status, content=content)
    data = await request.json()
    push_sse(data)
    return JSONResponse(content={"ok": True})
