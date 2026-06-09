"""Distributed captcha solving routes and state machine.

- POST /distribution/answer — submit answer, get next icon or complete
- In-memory state: distribution_states
"""

import logging
import threading
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.constants import DISTRIBUTION
from src.models import DistributionAnswerBody
from src.repositories import distribution_repo
from src.sse import lock as sse_lock, pending, push_sse

logger = logging.getLogger("eopp.distribution")

router = APIRouter(prefix="/distribution", tags=["distribution"])

distribution_states: dict[str, dict] = {}
_dist_lock = threading.Lock()


def build_icon_order(operator_id: int, num_operators: int) -> list[int]:
    """Return ordered list of icon positions for a participant.

    Master (id=0): left-to-right  [0, 1, 2, 3, 4]
    Operator (id>0): right-to-left [4, 3, 2, 1, 0]
    """
    assignments = DISTRIBUTION[num_operators]
    assigned = assignments.get(str(operator_id), [])
    remaining = [p for p in range(5) if p not in assigned]
    if operator_id == 0:
        return assigned + sorted(remaining)
    return assigned + sorted(remaining, reverse=True)


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
    event: threading.Event,
    usage_log_id: int,
    api_key_id: int,
    num_operators: int,
    icons_cache: dict,
    captcha_data: dict,
) -> None:
    assignments = DISTRIBUTION[num_operators]
    now = time.time()
    icon_assigned_at: dict[int, float] = {}
    for op_id_str, positions in assignments.items():
        if positions:
            icon_assigned_at[positions[0]] = now

    with _dist_lock:
        distribution_states[captcha_id] = {
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
        }
    logger.info(
        "distribution_state_init captcha=%s usage=%s ops=%s",
        captcha_id,
        usage_log_id,
        num_operators,
    )


def _find_next_unanswered(state: dict, operator_id: int) -> int | None:
    op = state["operators"][operator_id]
    assigned = op["assigned"]
    all_answers = state["all_answers"]

    while op["idx"] < len(assigned):
        pos = assigned[op["idx"]]
        op["idx"] += 1
        if pos not in all_answers:
            return pos

    if operator_id == 0:
        fallthrough = range(state["total_icons"])
    else:
        fallthrough = range(state["total_icons"] - 1, -1, -1)

    for pos in fallthrough:
        if pos not in all_answers:
            return pos

    return None


@router.post("/answer")
async def handle_distribution_answer(body: DistributionAnswerBody):
    captcha_id = body.captcha_id
    operator_id = body.operator_id
    icon_position = body.icon_position

    with _dist_lock:
        state = distribution_states.get(captcha_id)
        if not state:
            return JSONResponse(
                status_code=404,
                content={"error": "Distribution state not found for this captcha"},
            )

        if icon_position in state["all_answers"]:
            return JSONResponse(
                status_code=409,
                content={"error": "Icon already answered"},
            )

        op_info = state["operators"].setdefault(operator_id, {"assigned": [], "idx": 0})
        op_info.setdefault("idx", 0)
        assigned = op_info.get("assigned", [])

        if operator_id != 0 and icon_position not in assigned:
            own_remaining = [p for p in assigned if p not in state["all_answers"]]
            if own_remaining:
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

    push_sse(
        {
            "type": "distribution_progress",
            "captcha_id": captcha_id,
            "operator_id": operator_id,
            "icon_position": icon_position,
            "x": body.x,
            "y": body.y,
            "solved_count": len(state["all_answers"]),
            "total_icons": state["total_icons"],
            "answered_positions": sorted(state["all_answers"].keys()),
            "all_coords": state["all_answers"],
        }
    )

    distribution_repo.save_distribution_answer(
        usage_log_id=state.get("usage_log_id"),
        captcha_id=captcha_id,
        operator_id=operator_id,
        icon_position=icon_position,
        x=body.x,
        y=body.y,
        duration_ms=duration_ms,
    )

    if is_complete:
        coords = [state["all_answers"][i] for i in range(state["total_icons"])]
        coordinates = [{"x": c["x"], "y": c["y"]} for c in coords]

        with sse_lock:
            entry = pending.get(captcha_id)
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
        push_sse(solved_event, api_key_id=owner_id)

        from src.repositories import operator_repo
        from src.sse.manager import operator_api_key_id
        for op_real_id in operator_repo.get_subscribed_operators(owner_id):
            push_sse(solved_event, api_key_id=operator_api_key_id(op_real_id))

        with _dist_lock:
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
                "answered_positions": [int(p) for p in range(state["total_icons"])],
            }
        )

    with _dist_lock:
        next_pos = _find_next_unanswered(state, operator_id)
        if next_pos is not None:
            state.setdefault("icon_assigned_at", {})[next_pos] = time.time()

    total_answered = len(state["all_answers"])
    my_answered = sum(1 for p in op_info.get("assigned", []) if p in state["all_answers"])
    answered_positions = sorted(state["all_answers"].keys())

    if next_pos is None:
        return JSONResponse(
            content={
                "complete": True,
                "waiting": True,
                "solved_count": my_answered,
                "total_solved": total_answered,
                "total_icons": state["total_icons"],
                "answered_positions": answered_positions,
                "all_icons": make_all_icons(
                    state["icons_cache"],
                    build_icon_order(operator_id, state["num_operators"]),
                ),
            }
        )

    icon_data = state["icons_cache"].get(next_pos, {})
    icon_order = build_icon_order(operator_id, state["num_operators"])

    return JSONResponse(
        content={
            "icon_position": next_pos,
            "image": icon_data.get("image", ""),
            "icon": icon_data.get("icon", ""),
            "total_icons": state["total_icons"],
            "solved_count": my_answered,
            "total_solved": total_answered,
            "answered_positions": answered_positions,
            "all_icons": make_all_icons(state["icons_cache"], icon_order),
        }
    )
