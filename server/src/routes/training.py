"""Training routes — /admin/courses and /training/*"""

import json as _json
import logging
import os
import random
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.repositories import course_repo, test_run_repo
from src.repositories import api_key_repo, operator_repo
from src.policies.access_policy import token_from_request
from src.services.captcha_service import load_captcha_file

logger = logging.getLogger("eopp.training")

router = APIRouter(tags=["training"])


# ── Admin: Courses CRUD ────────────────────────────────────────────

@router.post("/admin/courses")
async def admin_create_course(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    name = body.get("name", "").strip()
    if not name:
        return JSONResponse(status_code=400, content={"error": "name is required"})
    captcha_file_ids = body.get("captcha_file_ids", [])
    if not captcha_file_ids:
        return JSONResponse(status_code=400, content={"error": "captcha_file_ids is required"})
    description = body.get("description", "")
    created_by = body.get("created_by", "")
    pause_between = body.get("pause_between", True)

    course = course_repo.create_course(name, captcha_file_ids, description, created_by, pause_between)
    logger.info("course_created id=%d name=%s count=%d", course["id"], name, course["captcha_count"])
    return JSONResponse(content=course)


@router.get("/admin/courses")
async def admin_list_courses(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=course_repo.list_courses())


@router.get("/admin/courses/{course_id}")
async def admin_get_course(course_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    course = course_repo.get_course(course_id)
    if not course:
        return JSONResponse(status_code=404, content={"error": "Course not found"})
    return JSONResponse(content=course)


@router.delete("/admin/courses/{course_id}")
async def admin_delete_course(course_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    ok = course_repo.delete_course(course_id)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "Course not found"})
    return JSONResponse(content={"ok": True})


@router.get("/admin/training/runs")
async def admin_training_runs(request: Request):
    """Admin: list all test runs across all participants."""
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    runs = test_run_repo.list_test_runs(limit=200)
    enriched = []
    for r in runs:
        course = course_repo.get_course(r["course_id"])
        stats = test_run_repo.get_test_run_stats(r["id"])
        participant_label = ""
        if r["participant_type"] == "operator":
            op = operator_repo.get_operator_by_id(r["participant_id"])
            participant_label = op["nickname"] if op else f"op#{r['participant_id']}"
        elif r["participant_type"] == "api_key":
            key = api_key_repo.get_key_by_id(r["participant_id"])
            participant_label = key.label if key else f"key#{r['participant_id']}"
        enriched.append({
            **r,
            "course_name": course["name"] if course else "?",
            "participant_label": participant_label,
            "stats": stats,
        })
    return JSONResponse(content=enriched)


# ── Training: Test Runs ─────────────────────────────────────────────

def _validate_participant(participant_type: str, participant_id: int) -> bool:
    """Check that the participant exists."""
    if participant_type == "operator":
        return operator_repo.get_operator_by_id(participant_id) is not None
    if participant_type == "api_key":
        return api_key_repo.get_key_by_id(participant_id) is not None
    return False


@router.post("/training/start")
async def training_start(request: Request):
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    course_id = body.get("course_id")
    participant_type = body.get("participant_type", "")
    participant_id = body.get("participant_id")

    if not course_id or not participant_type or participant_id is None:
        return JSONResponse(status_code=400, content={"error": "course_id, participant_type, participant_id required"})

    if participant_type not in ("operator", "api_key"):
        return JSONResponse(status_code=400, content={"error": "participant_type must be 'operator' or 'api_key'"})

    if not _validate_participant(participant_type, participant_id):
        return JSONResponse(status_code=404, content={"error": f"{participant_type} #{participant_id} not found"})

    course = course_repo.get_course(course_id)
    if not course:
        return JSONResponse(status_code=404, content={"error": "Course not found"})
    if not course.get("captchas"):
        return JSONResponse(status_code=400, content={"error": "Course has no captchas"})

    interval_min = body.get("interval_min", 2.0)
    interval_max = body.get("interval_max", 7.0)

    tr = test_run_repo.create_test_run(
        course_id=course_id,
        participant_type=participant_type,
        participant_id=participant_id,
        interval_min=interval_min,
        interval_max=interval_max,
    )
    logger.info(
        "test_run_started id=%d course=%d participant=%s/%d",
        tr["id"], course_id, participant_type, participant_id,
    )
    return JSONResponse(content={
        **tr,
        "total_captchas": len(course["captchas"]),
        "captcha_ids": [c["captcha_id"] for c in course["captchas"]],
        "pause_between": course.get("pause_between", True),
    })


@router.get("/training/run/{run_id}/next")
async def training_next_captcha(run_id: int, request: Request):
    """Get the next unsolved captcha for the test run."""
    tr = test_run_repo.get_test_run(run_id)
    if not tr:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})
    if tr["status"] not in ("running",):
        return JSONResponse(status_code=400, content={"error": f"Test run is {tr['status']}"})

    course = course_repo.get_course(tr["course_id"])
    if not course:
        return JSONResponse(status_code=404, content={"error": "Course not found"})

    results = test_run_repo.get_test_run_results(run_id)
    solved_ids = {r["captcha_id"] for r in results}
    remaining = [c for c in course["captchas"] if c["captcha_id"] not in solved_ids]

    if not remaining:
        return JSONResponse(content={"done": True})

    next_captcha = remaining[0]
    captcha_id = next_captcha["captcha_id"]
    data = load_captcha_file(captcha_id)

    # Fallback: if file not in all_dir(), try file_path from DB
    if not data:
        from src.repositories import captcha_file_repo
        cf = captcha_file_repo.get_by_captcha_id(captcha_id)
        if cf and cf.file_path and os.path.isfile(cf.file_path):
            try:
                with open(cf.file_path, encoding="utf-8") as f:
                    data = _json.load(f)
            except Exception:
                data = None

    if not data:
        return JSONResponse(status_code=500, content={"error": f"Failed to load captcha {captcha_id}"})

    from src.captcha_assembly import is_icon_click_type, get_valid_variant_index
    from src.core.captcha_runtime.display_payload import build_captcha_display_fields

    if is_icon_click_type(data):
        from src.captcha_solver_engine.images import assemble_icon_click_preview
        puzzle_data = data.get("puzzle", data)
        main_b64 = puzzle_data.get("imageBase64", "") if isinstance(puzzle_data, dict) else ""
        icons_b64 = puzzle_data.get("iconsBase64", "") if isinstance(puzzle_data, dict) else ""
        try:
            gen = assemble_icon_click_preview(main_b64, icons_b64)
        except Exception:
            gen = []
        return JSONResponse(content={
            "done": False,
            "captcha_file_id": next_captcha["captcha_file_id"],
            "captcha_id": captcha_id,
            "captcha_type": 1,
            "valid_index": get_valid_variant_index(data),
            "images": {str(g["index"]): g["image"] for g in gen} if gen else {},
            "icons_image": gen[0].get("icons", "") if gen else "",
        })
    else:
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])
        valid_index = get_valid_variant_index(data)
        display = build_captcha_display_fields({"images": {}, "tiles": tiles, "variants": variants}).to_dict()
        return JSONResponse(content={
            "done": False,
            "captcha_file_id": next_captcha["captcha_file_id"],
            "captcha_id": captcha_id,
            "captcha_type": 0,
            "valid_index": valid_index,
            "variants_count": display["count"],
            **display,
        })


@router.post("/training/run/{run_id}/answer")
async def training_submit_answer(run_id: int, request: Request):
    """Submit an answer for the current captcha in the test run."""
    tr = test_run_repo.get_test_run(run_id)
    if not tr:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})
    if tr["status"] != "running":
        return JSONResponse(status_code=400, content={"error": f"Test run is {tr['status']}"})

    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    captcha_id = body.get("captcha_id", "")
    variant_index = body.get("variant_index")
    duration_ms = body.get("duration_ms")
    icon_times = body.get("icon_times")  # [{icon_position, duration_ms}]

    if not captcha_id:
        return JSONResponse(status_code=400, content={"error": "captcha_id is required"})

    # Determine correctness
    course = course_repo.get_course(tr["course_id"])
    if not course:
        return JSONResponse(status_code=404, content={"error": "Course not found"})

    captcha_info = None
    for c in course["captchas"]:
        if c["captcha_id"] == captcha_id:
            captcha_info = c
            break

    captcha_file_id = body.get("captcha_file_id") or (captcha_info.get("captcha_file_id") if captcha_info else None)

    valid_index = captcha_info.get("valid_index") if captcha_info else None
    is_correct = None
    if valid_index is not None and variant_index is not None:
        is_correct = (variant_index == valid_index)
        status = "correct" if is_correct else "incorrect"
    elif icon_times and captcha_info:
        # Icon-click: check against boxes if available
        from src.captcha_assembly import check_icon_click_answer
        data = load_captcha_file(captcha_id)
        boxes = data.get("boxes") if data else None
        if boxes and isinstance(boxes, list) and len(boxes) == len(icon_times):
            coords = [{"x": it.get("x", 0), "y": it.get("y", 0)} for it in icon_times]
            is_correct = check_icon_click_answer(coords, boxes)
            status = "correct" if is_correct else "incorrect"
        else:
            status = "pending"
    else:
        status = "pending"
        is_correct = None

    result = test_run_repo.save_test_result(
        test_run_id=run_id,
        captcha_file_id=captcha_file_id,
        captcha_id=captcha_id,
        status=status,
        variant_index=variant_index,
        duration_ms=duration_ms,
        icon_times=icon_times,
    )

    return JSONResponse(content={
        **result,
        "is_correct": is_correct,
    })


@router.get("/training/run/{run_id}/status")
async def training_run_status(run_id: int):
    tr = test_run_repo.get_test_run(run_id)
    if not tr:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})

    course = course_repo.get_course(tr["course_id"])
    total = len(course["captchas"]) if course else 0
    results = test_run_repo.get_test_run_results(run_id)
    solved = len(results)
    stats = test_run_repo.get_test_run_stats(run_id)

    return JSONResponse(content={
        **tr,
        "total_captchas": total,
        "solved": solved,
        "remaining": total - solved,
        "stats": stats,
    })


@router.post("/training/run/{run_id}/complete")
async def training_complete_run(run_id: int):
    ok = test_run_repo.complete_test_run(run_id)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})
    return JSONResponse(content={"ok": True})


@router.post("/training/run/{run_id}/cancel")
async def training_cancel_run(run_id: int):
    ok = test_run_repo.cancel_test_run(run_id)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})
    return JSONResponse(content={"ok": True})


@router.get("/training/run/{run_id}/results")
async def training_run_results(run_id: int):
    tr = test_run_repo.get_test_run(run_id)
    if not tr:
        return JSONResponse(status_code=404, content={"error": "Test run not found"})

    course = course_repo.get_course(tr["course_id"])
    results = test_run_repo.get_test_run_results(run_id)
    stats = test_run_repo.get_test_run_stats(run_id)

    # Enrich results with captcha info from course
    captcha_map = {}
    if course:
        captcha_map = {c["captcha_id"]: c for c in course["captchas"]}

    enriched = []
    for r in results:
        info = captcha_map.get(r["captcha_id"], {})
        enriched.append({
            **r,
            "valid_index": info.get("valid_index"),
            "captcha_type": info.get("captcha_type") or r.get("captcha_type"),
        })

    return JSONResponse(content={
        "test_run": tr,
        "course": {"id": course["id"], "name": course["name"]} if course else None,
        "stats": stats,
        "results": enriched,
    })


@router.get("/training/runs")
async def training_list_runs(
    participant_type: str = None,
    participant_id: int = None,
):
    runs = test_run_repo.list_test_runs(participant_type, participant_id)
    # Enrich with course names and stats
    enriched = []
    for r in runs:
        course = course_repo.get_course(r["course_id"])
        stats = test_run_repo.get_test_run_stats(r["id"])
        enriched.append({
            **r,
            "course_name": course["name"] if course else "?",
            "stats": stats,
        })
    return JSONResponse(content=enriched)


@router.get("/training/stats/{participant_type}/{participant_id}")
async def training_participant_stats(participant_type: str, participant_id: int):
    if participant_type not in ("operator", "api_key"):
        return JSONResponse(status_code=400, content={"error": "participant_type must be 'operator' or 'api_key'"})
    trend = test_run_repo.get_participant_stats(participant_type, participant_id)
    return JSONResponse(content=trend)


@router.get("/training/courses")
async def training_list_courses():
    """Public list of courses for training page (no auth needed)."""
    return JSONResponse(content=course_repo.list_courses())


@router.get("/training/resolve-operator")
async def training_resolve_operator(uuid: str):
    """Resolve operator UUID to ID for training page."""
    op = operator_repo.get_operator_by_uuid(uuid)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    return JSONResponse(content={"operator_id": op["id"], "nickname": op["nickname"]})


@router.get("/training/captcha/{captcha_id}")
async def training_get_captcha(captcha_id: str):
    """Load a single captcha's assembled images for review."""
    data = load_captcha_file(captcha_id)

    # Fallback: if file not in all_dir(), try file_path from DB
    if not data:
        from src.repositories import captcha_file_repo
        cf = captcha_file_repo.get_by_captcha_id(captcha_id)
        if cf and cf.file_path and os.path.isfile(cf.file_path):
            try:
                with open(cf.file_path, encoding="utf-8") as f:
                    data = _json.load(f)
            except Exception:
                data = None

    if not data:
        return JSONResponse(status_code=404, content={"error": "Captcha not found"})

    from src.captcha_assembly import is_icon_click_type, get_valid_variant_index
    from src.core.captcha_runtime.display_payload import build_captcha_display_fields

    if is_icon_click_type(data):
        from src.captcha_solver_engine.images import assemble_icon_click_preview
        puzzle_data = data.get("puzzle", data)
        main_b64 = puzzle_data.get("imageBase64", "") if isinstance(puzzle_data, dict) else ""
        icons_b64 = puzzle_data.get("iconsBase64", "") if isinstance(puzzle_data, dict) else ""
        # Pass any coordinate/box metadata from the captcha file
        extra = {}
        if isinstance(puzzle_data, dict):
            for k in ("coordinates", "icons", "boxes", "icon_positions", "answer"):
                if k in puzzle_data:
                    extra[k] = puzzle_data[k]
        try:
            gen = assemble_icon_click_preview(main_b64, icons_b64)
        except Exception:
            gen = []
        return JSONResponse(content={
            "captcha_id": captcha_id,
            "captcha_type": 1,
            "valid_index": get_valid_variant_index(data),
            "images": {str(g["index"]): g["image"] for g in gen} if gen else {},
            "icons_image": gen[0].get("icons", "") if gen else "",
            "meta": extra if extra else None,
            "coordinates": data.get("coordinates") if isinstance(data.get("coordinates"), list) else None,
            "boxes": data.get("boxes") if isinstance(data.get("boxes"), list) else None,
        })
    else:
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])
        valid_index = get_valid_variant_index(data)
        display = build_captcha_display_fields({"images": {}, "tiles": tiles, "variants": variants}).to_dict()
        return JSONResponse(content={
            "captcha_id": captcha_id,
            "captcha_type": 0,
            "valid_index": valid_index,
            "variants_count": display["count"],
            **display,
        })
