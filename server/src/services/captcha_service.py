import json
import os
import threading
import time

from src.captcha_assembly import assemble_captchas, get_valid_variant_index, is_icon_click_type
from src.services import captcha_file_service
from src.entities import ApiKey
from src.repositories import api_key_repo, usage_log_repo
from src.policies.access_policy import is_admin_token
from src.sse import get_connected_streams, push_sse


def authorize_broadcast(admin_token: str | None) -> tuple[int, dict] | None:
    if is_admin_token(admin_token):
        return None
    return 401, {"error": "Unauthorized"}


def validate_captcha_api_key(api_key: str) -> tuple[int, dict] | ApiKey:
    validation = api_key_repo.validate_api_key(api_key)
    if not validation["valid"]:
        return 403, {"error": "Invalid API key", "reason": validation["reason"]}

    key_record = api_key_repo.get_key_record(api_key)
    if not key_record:
        return 403, {"error": "Invalid API key", "reason": "Key not found"}
    return key_record


def get_or_create_usage_log(
    usage_log_id: int | None,
    api_key: str,
    reservation_id: str,
    captcha_id: str,
) -> int:
    if usage_log_id:
        return usage_log_id
    return usage_log_repo.create_usage(
        api_key=api_key,
        reservation_id=reservation_id,
        captcha_id=captcha_id,
    )


def verify_usage_log_matches_captcha(usage_log_id: int, captcha_id: str) -> bool:
    log_entry = usage_log_repo.get_usage(usage_log_id)
    return bool(log_entry)


def load_captcha_file(captcha_id: str) -> dict | None:
    return captcha_file_service.load_captcha_payload(captcha_id)


def read_label_captcha(captcha_id: str) -> dict | None:
    source_path = captcha_file_service.captcha_file_path(captcha_id)

    # Fallback: if file not in all_dir(), try file_path from DB
    if not os.path.exists(source_path):
        from src.repositories import captcha_file_repo
        cf = captcha_file_repo.get_by_captcha_id(captcha_id)
        if cf and cf.file_path and os.path.isfile(cf.file_path):
            source_path = cf.file_path

    if not os.path.exists(source_path):
        return None
    try:
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        if captcha_file_service.ensure_analysis_metadata(data):
            captcha_file_service.write_captcha_json(source_path, data)
        captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
    except Exception:
        return None

    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])

    from src.captcha_assembly import is_icon_click_type

    if is_icon_click_type(data):
        from src.captcha_solver_engine.images import assemble_icon_click_preview
        main_b64 = puzzle.get("imageBase64", "") if isinstance(puzzle, dict) else ""
        icons_b64 = puzzle.get("iconsBase64", "") if isinstance(puzzle, dict) else ""
        # Extract ground-truth coordinates from the captcha file
        coords = None
        # Check root level first (written by usage_log parsing)
        if isinstance(data.get("coordinates"), list):
            coords = data["coordinates"]
        # Fallback: check inside puzzle
        if not coords and isinstance(puzzle, dict):
            for k in ("coordinates", "boxes", "icon_positions", "answer"):
                val = puzzle.get(k)
                if isinstance(val, list) and len(val) > 0:
                    if all(isinstance(v, dict) and "x" in v and "y" in v for v in val):
                        coords = [{"x": v["x"], "y": v["y"]} for v in val]
                        break
        try:
            gen = assemble_icon_click_preview(main_b64, icons_b64, coords)
        except Exception:
            gen = []
        return {
            "captcha_id": captcha_id,
            "filename": f"{captcha_id}.json",
            "captcha_type": "icon_click",
            "valid_index": get_valid_variant_index(data),
            "no_valid_index": data.get("no_valid_index") if isinstance(data.get("no_valid_index"), int) else None,
            "manual_labeled": data.get("manual_labeled") is True,
            "label_source": data.get("label_source") if isinstance(data.get("label_source"), str) else None,
            "solver_top3": [],
            "solver_results": [],
            "variants_count": 1,
            "images": {str(g["index"]): g["image"] for g in gen} if gen else {},
            "icons_image": gen[0].get("icons", "") if gen else "",
            "coordinates": coords,
            "boxes": data.get("boxes") if isinstance(data.get("boxes"), list) else None,
        }

    if not tiles or not variants:
        return None

    valid_index = get_valid_variant_index(data)
    generated = assemble_captchas(tiles, variants, valid_index)
    return {
        "captcha_id": captcha_id,
        "filename": f"{captcha_id}.json",
        "valid_index": valid_index,
        "no_valid_index": data.get("no_valid_index")
        if isinstance(data.get("no_valid_index"), int)
        else None,
        "manual_labeled": data.get("manual_labeled") is True,
        "label_source": data.get("label_source")
        if isinstance(data.get("label_source"), str)
        else None,
        "solver_top3": data.get("solver_top3") if isinstance(data.get("solver_top3"), list) else [],
        "solver_results": data.get("solver_results")
        if isinstance(data.get("solver_results"), list)
        else [],
        "variants_count": len(generated),
        "images": {str(item["index"]): item["image"] for item in generated},
    }


def read_label_next_captcha() -> dict | None:
    from src.captcha_assembly import is_icon_click_type
    all_dir = captcha_file_service.all_dir()
    if not os.path.isdir(all_dir):
        return None
    files = sorted(f for f in os.listdir(all_dir) if f.endswith(".json"))
    if not files:
        return None
    filename = None
    data = None
    for candidate in files:
        path = os.path.join(all_dir, candidate)
        try:
            with open(path, encoding="utf-8") as f:
                candidate_data = json.load(f)
        except Exception:
            continue
        if is_icon_click_type(candidate_data):
            continue
        if get_valid_variant_index(candidate_data) is None:
            filename = candidate
            data = candidate_data
            break
    if not filename or data is None:
        return None
    captcha_id = os.path.splitext(filename)[0]
    return read_label_captcha(captcha_id)


def save_captcha_label(captcha_id: str, variant_index: int) -> tuple[int, dict]:
    source_path = captcha_file_service.captcha_file_path(captcha_id)
    if not os.path.exists(source_path):
        return 404, {"error": "captcha file not found"}
    try:
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        puzzle = data.get("puzzle", data)
        variants = puzzle.get("variantsCapture", [])
        if variant_index < 0 or variant_index >= len(variants):
            return 422, {"error": "variant_index out of range"}
        data["valid_index"] = variant_index
        data["manual_labeled"] = True
        data["label_source"] = "manual"
        captcha_file_service.write_captcha_json(source_path, data)
        captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
        return 200, {"ok": True, "captcha_id": captcha_id, "valid_index": variant_index}
    except Exception as exc:
        return 500, {"error": f"save failed: {exc}"}


def replay_captchas(captcha_ids: list[str]) -> int | None:
    if not captcha_ids:
        return None
    streams = get_connected_streams()
    if not streams:
        return None

    def send_captchas():
        for cid in captcha_ids:
            data = load_captcha_file(cid)
            if not data:
                continue

            if is_icon_click_type(data):
                from src.captcha_solver_engine.images import assemble_icon_click_preview
                puzzle_data = data.get("puzzle", data)
                main_b64 = puzzle_data.get("imageBase64", "") if isinstance(puzzle_data, dict) else ""
                icons_b64 = puzzle_data.get("iconsBase64", "") if isinstance(puzzle_data, dict) else ""
                try:
                    gen = assemble_icon_click_preview(main_b64, icons_b64)
                except Exception:
                    gen = []
                sse = {
                    "type": "new_captcha",
                    "captcha_id": cid,
                    "images": {str(g["index"]): g["image"] for g in gen} if gen else {},
                    "count": len(gen),
                    "top3": [],
                    "confident": False,
                    "created_at": time.time(),
                    "timeout": 30,
                    "owner_label": "replay",
                    "owner_api_key_id": -1,
                    "captcha_type": 1,
                    "icons_image": gen[0].get("icons", "") if gen else "",
                }
            else:
                puzzle = data.get("puzzle", data)
                tiles = puzzle.get("tiles", [])
                variants = puzzle.get("variantsCapture", [])
                valid_index = get_valid_variant_index(data)
                generated = assemble_captchas(tiles, variants, valid_index)
                sse = {
                    "type": "new_captcha",
                    "captcha_id": cid,
                    "images": {str(g["index"]): g["image"] for g in generated},
                    "count": len(generated),
                    "top3": [],
                    "created_at": time.time(),
                    "timeout": 30,
                    "owner_label": "replay",
                    "owner_api_key_id": -1,
                }
            push_sse(sse)
            time.sleep(1)

    t = threading.Thread(target=send_captchas, daemon=True)
    t.start()
    return len(captcha_ids)


def save_captcha_boxes(captcha_id: str, boxes: list[dict]) -> tuple[int, dict]:
    """Save bounding boxes for an icon-click captcha.

    Args:
        captcha_id: captcha identifier
        boxes: [{x, y, w, h}, ...] — up to 5 boxes, one per icon position
    """
    if len(boxes) != 5:
        return 422, {"error": f"expected 5 boxes, got {len(boxes)}"}
    for i, b in enumerate(boxes):
        for k in ("x", "y", "w", "h"):
            if not isinstance(b.get(k), (int, float)):
                return 422, {"error": f"box[{i}] missing or invalid field: {k}"}

    source_path = captcha_file_service.captcha_file_path(captcha_id)
    if not os.path.exists(source_path):
        return 404, {"error": "captcha file not found"}
    try:
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        data["boxes"] = boxes
        data["manual_labeled"] = True
        data["label_source"] = "manual_boxes"
        captcha_file_service.write_captcha_json(source_path, data)
        captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
        return 200, {"ok": True, "captcha_id": captcha_id, "boxes": boxes}
    except Exception as exc:
        return 500, {"error": f"save failed: {exc}"}


def save_captcha_coordinates(captcha_id: str, coordinates: list[dict]) -> tuple[int, dict]:
    """Save click coordinates for an icon-click captcha (points mode labeling)."""
    if len(coordinates) != 5:
        return 422, {"error": f"expected 5 coordinates, got {len(coordinates)}"}
    for i, c in enumerate(coordinates):
        for k in ("x", "y"):
            if not isinstance(c.get(k), (int, float)):
                return 422, {"error": f"coordinate[{i}] missing or invalid field: {k}"}

    source_path = captcha_file_service.captcha_file_path(captcha_id)
    if not os.path.exists(source_path):
        return 404, {"error": "captcha file not found"}
    try:
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        data["coordinates"] = coordinates
        data["manual_labeled"] = True
        data["label_source"] = "manual_points"
        captcha_file_service.write_captcha_json(source_path, data)
        captcha_file_service.upsert_captcha_file_data(source_path, data, captcha_id)
        return 200, {"ok": True, "captcha_id": captcha_id, "coordinates": coordinates}
    except Exception as exc:
        return 500, {"error": f"save failed: {exc}"}
