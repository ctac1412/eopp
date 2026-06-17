"""Distributed captcha solving routes and state machine.

- POST /distribution/answer — submit answer, get next icon or complete
- In-memory state: distribution_states
"""

import asyncio
import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor, wait
from threading import Lock

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.constants import DISTRIBUTION, ICON_ORDER
from src.models import DistributionAnswerBody
from src.policies.access_policy import token_from_request
from src.platform.observability.metrics import counter_inc, observe_latency_ms
from src.repositories import distribution_repo
from src.repositories import user_repo
from src.sse import push_sse

logger = logging.getLogger("eopp.distribution")

router = APIRouter(prefix="/distribution", tags=["distribution"])

distribution_states: dict[str, dict] = {}
_answer_archive_executor = ThreadPoolExecutor(
    max_workers=1,
    thread_name_prefix="distribution-answer-archive",
)
_answer_archive_futures: set[Future] = set()
_answer_archive_futures_lock = Lock()


def _save_distribution_answer_archive(payload: dict) -> None:
    start = time.perf_counter()
    try:
        distribution_repo.save_distribution_answer(**payload)
        counter_inc("distribution_answer_archive_saved_total")
    except Exception:
        counter_inc("distribution_answer_archive_failures_total")
        logger.exception(
            "distribution_answer_archive_failed captcha=%s icon=%s",
            payload.get("captcha_id"),
            payload.get("icon_position"),
        )
    finally:
        observe_latency_ms(
            "distribution.answer.archive_save_ms",
            (time.perf_counter() - start) * 1000,
        )


def schedule_distribution_answer_archive(payload: dict) -> None:
    """Submit click archival outside the operator response hot path.

    Active distribution state, next-icon selection, completion, and SSE fanout
    are all in memory. This archive write feeds records, finance, and admin
    history, so submit failures are observable but must not block operators.
    """

    start = time.perf_counter()
    try:
        future = _answer_archive_executor.submit(_save_distribution_answer_archive, dict(payload))
    except Exception:
        counter_inc("distribution_answer_archive_submit_failures_total")
        logger.exception(
            "distribution_answer_archive_submit_failed captcha=%s icon=%s",
            payload.get("captcha_id"),
            payload.get("icon_position"),
        )
    else:
        with _answer_archive_futures_lock:
            _answer_archive_futures.add(future)
        future.add_done_callback(_forget_distribution_answer_archive)
        counter_inc("distribution_answer_archive_submitted_total")
    finally:
        observe_latency_ms(
            "distribution.answer.archive_submit_ms",
            (time.perf_counter() - start) * 1000,
        )


def _forget_distribution_answer_archive(future: Future) -> None:
    with _answer_archive_futures_lock:
        _answer_archive_futures.discard(future)


def wait_for_distribution_answer_archives(timeout: float | None = None) -> None:
    """Wait for currently submitted archive writes; intended for tests."""

    with _answer_archive_futures_lock:
        futures = list(_answer_archive_futures)
    if futures:
        wait(futures, timeout=timeout)


def build_icon_order(operator_id: int, num_operators: int) -> list[int]:
    """Return full icon order for a participant from the hardcoded ICON_ORDER map."""
    return list(ICON_ORDER.get(num_operators, {}).get(str(operator_id), list(range(5))))


def make_all_icons(icons_cache: dict, icon_order: list[int]) -> list[dict]:
    """Build ordered icon preview list from cache."""
    return [
        {
            "position": pos,
            "icon": icons_cache.get(pos, {}).get("icon", ""),
        }
        for pos in icon_order
    ]


def init_distribution_state(
    captcha_id: str,
    event: asyncio.Event,
    usage_log_id: int,
    api_key_id: int,
    num_operators: int,
    icons_cache: dict,
    captcha_data: dict,
    operator_id_map: dict[int, int] | None = None,
    operator_display_modes: dict[int, str] | None = None,
) -> None:
    """operator_id_map: slot_index → real_operator_id (DB operator.id).
    Slot 0 (master) maps to 0. Slot 1 maps to the subscribed operator's real ID.

    operator_display_modes: {real_operator_id: icon_display_mode} for own_only check.
    """
    assignments = DISTRIBUTION[num_operators]
    now = time.time()
    icon_assigned_at: dict[int, float] = {}
    for op_id_str, positions in assignments.items():
        if positions:
            icon_assigned_at[positions[0]] = now

    distribution_states[captcha_id] = {
        "lock": asyncio.Lock(),
        "event": event,
        "usage_log_id": usage_log_id,
        "api_key_id": api_key_id,
        "total_icons": 5,
        "num_operators": num_operators,
        "operators": {
            int(op_id): {"assigned": positions, "idx": 0}
            for op_id, positions in assignments.items()
        },
        "all_answers": {},
        "icon_assigned_at": icon_assigned_at,
        "icons_cache": icons_cache,
        "captcha_data": captcha_data,
        "operator_id_map": operator_id_map or {},
        "operator_display_modes": operator_display_modes or {},
    }
    logger.info(
        "distribution_state_init captcha=%s usage=%s ops=%s display_modes=%s",
        captcha_id,
        usage_log_id,
        num_operators,
        operator_display_modes or {},
    )


def _find_next_unanswered(state: dict, operator_id: int) -> int | None:
    op = state["operators"].get(operator_id)
    if not op:
        return None
    all_answers = state["all_answers"]
    icon_order = build_icon_order(operator_id, state["num_operators"])
    assigned = set(op.get("assigned", []))

    # Check icon_display_mode for real operators
    op_id_map = state.get("operator_id_map", {})
    display_modes = state.get("operator_display_modes", {})
    real_id = op_id_map.get(operator_id, operator_id)
    mode = display_modes.get(real_id, "own_then_foreign")

    own_exhausted = all(p in all_answers for p in assigned)

    while op["idx"] < len(icon_order):
        pos = icon_order[op["idx"]]
        op["idx"] += 1
        if pos not in all_answers:
            # For own_only mode: skip positions not in own assigned set
            if mode == "own_only" and pos not in assigned:
                continue
            return pos

    return None


@router.post("/answer")
async def handle_distribution_answer(body: DistributionAnswerBody, request: Request):
    if not user_repo.get_session_user(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    request_start = time.perf_counter()
    captcha_id = body.captcha_id
    operator_id = body.operator_id
    icon_position = body.icon_position

    try:
        state = distribution_states.get(captcha_id)
        if not state:
            return JSONResponse(
                status_code=404,
                content={"error": "Distribution state not found for this captcha"},
            )

        lock_wait_start = time.perf_counter()
        async with state["lock"]:
            observe_latency_ms(
                "distribution.answer.lock_wait_ms",
                (time.perf_counter() - lock_wait_start) * 1000,
            )
            state_start = time.perf_counter()
            if icon_position in state["all_answers"]:
                next_pos = _find_next_unanswered(state, operator_id)
                observe_latency_ms(
                    "distribution.answer.state_ms",
                    (time.perf_counter() - state_start) * 1000,
                )
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "Icon already answered",
                        "next_available": next_pos,
                        "answered_positions": sorted(state["all_answers"].keys()),
                        "all_coords": state["all_answers"],
                    },
                )

            op_info = state["operators"].setdefault(operator_id, {"assigned": [], "idx": 0})
            op_info.setdefault("idx", 0)
            assigned = op_info.get("assigned", [])

            if operator_id > 0 and icon_position not in assigned:
                own_remaining = [p for p in assigned if p not in state["all_answers"]]
                if own_remaining:
                    observe_latency_ms(
                        "distribution.answer.state_ms",
                        (time.perf_counter() - state_start) * 1000,
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"error": "Icon not assigned to this operator", "next_assigned": own_remaining[0]},
                    )

            state["all_answers"][icon_position] = {
                "x": body.x,
                "y": body.y,
                "operator_id": operator_id,
            }

            answered_at = time.time()
            assigned_at = state.get("icon_assigned_at", {}).get(icon_position)
            duration_ms = int((answered_at - assigned_at) * 1000) if assigned_at else None

            is_complete = len(state["all_answers"]) == state["total_icons"]

            if not is_complete:
                next_pos = _find_next_unanswered(state, operator_id)
                if next_pos is not None:
                    state.setdefault("icon_assigned_at", {})[next_pos] = time.time()
            total_answered = len(state["all_answers"])
            total_icons = state["total_icons"]
            all_answers = dict(state["all_answers"])
            answered_positions = sorted(all_answers.keys())
            observe_latency_ms(
                "distribution.answer.state_ms",
                (time.perf_counter() - state_start) * 1000,
            )

        sse_start = time.perf_counter()
        push_sse(
            {
                "type": "distribution_progress",
                "captcha_id": captcha_id,
                "operator_id": operator_id,
                "icon_position": icon_position,
                "x": body.x,
                "y": body.y,
                "solved_count": total_answered,
                "total_icons": total_icons,
                "answered_positions": answered_positions,
                "all_coords": all_answers,
            }
        )
        observe_latency_ms("distribution.answer.sse_ms", (time.perf_counter() - sse_start) * 1000)

        schedule_distribution_answer_archive(
            {
                "usage_log_id": state.get("usage_log_id"),
                "captcha_id": captcha_id,
                "operator_id": state.get("operator_id_map", {}).get(operator_id, operator_id),
                "icon_position": icon_position,
                "x": body.x,
                "y": body.y,
                "duration_ms": duration_ms,
            }
        )

        if is_complete:
            coords = [all_answers[i] for i in range(total_icons)]
            coordinates = [{"x": c["x"], "y": c["y"]} for c in coords]

            from src.sse import pending as sse_pending
            entry = sse_pending.get(captcha_id)
            if entry:
                entry["result"] = {
                    "variantIndex": 0,
                    "variantTiles": coordinates,
                    "captcha_type": 1,
                }
                entry["event"].set()

            owner_id = state["api_key_id"]
            solved_event = {
                "type": "captcha_solved",
                "captcha_id": captcha_id,
                "solved_by_super": False,
                "solver_label": f"distributed_{state['num_operators']}op",
                "owner_api_key_id": owner_id,
            }
            from src.sse.manager import push_sse_owner_and_operators

            push_sse_owner_and_operators(solved_event, owner_id)

            distribution_states.pop(captcha_id, None)

            logger.info(
                "distribution_complete captcha=%s answers=%d",
                captcha_id,
                len(coordinates),
            )

            return JSONResponse(
                content={
                    "complete": True,
                    "coordinates": coordinates,
                    "answered_positions": [int(p) for p in range(total_icons)],
                }
            )

        my_answered = sum(1 for p in assigned if p in all_answers)
        icons_cache = state["icons_cache"]
        num_operators = state["num_operators"]

        if next_pos is None:
            return JSONResponse(
                content={
                    "complete": True,
                    "waiting": True,
                    "solved_count": my_answered,
                    "total_solved": total_answered,
                    "total_icons": total_icons,
                    "answered_positions": answered_positions,
                    "all_icons": make_all_icons(
                        icons_cache,
                        build_icon_order(operator_id, num_operators),
                    ),
                }
            )

        icon_data = icons_cache.get(next_pos, {})
        icon_order = build_icon_order(operator_id, num_operators)

        return JSONResponse(
            content={
                "icon_position": next_pos,
                "image": icon_data.get("image", ""),
                "icon": icon_data.get("icon", ""),
                "total_icons": total_icons,
                "solved_count": my_answered,
                "total_solved": total_answered,
                "answered_positions": answered_positions,
                "all_icons": make_all_icons(icons_cache, icon_order),
            }
        )
    finally:
        observe_latency_ms(
            "distribution.answer.total_ms",
            (time.perf_counter() - request_start) * 1000,
        )
