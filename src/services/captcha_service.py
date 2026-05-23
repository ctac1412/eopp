import json
import os
import threading
import time

from src.captcha_assembly import assemble_captchas, get_valid_variant_index
from src.constants import NO_VALID_DIR, VALID_DIR
from src.db import check_admin_token
from src.entities import ApiKey
from src.repositories import api_key_repo, usage_log_repo
from src.sse import get_connected_streams, push_sse


def authorize_broadcast(admin_token: str | None) -> tuple[int, dict] | None:
    if admin_token and check_admin_token(admin_token):
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
    return bool(log_entry and log_entry.captcha_id == captcha_id)


def load_captcha_file(captcha_id: str) -> dict | None:
    for d in [VALID_DIR, NO_VALID_DIR]:
        path = os.path.join(d, f"{captcha_id}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    return None


def read_label_next_captcha() -> dict | None:
    if not os.path.isdir(NO_VALID_DIR):
        return None
    files = sorted(f for f in os.listdir(NO_VALID_DIR) if f.endswith(".json"))
    if not files:
        return None
    filename = files[0]
    path = os.path.join(NO_VALID_DIR, filename)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    if not tiles or not variants:
        return None
    valid_index = get_valid_variant_index(data)
    generated = assemble_captchas(tiles, variants, valid_index)
    captcha_id = os.path.splitext(filename)[0]
    return {
        "captcha_id": captcha_id,
        "filename": filename,
        "variants_count": len(generated),
        "images": {str(item["index"]): item["image"] for item in generated},
    }


def save_captcha_label(captcha_id: str, variant_index: int) -> tuple[int, dict]:
    source_path = os.path.join(NO_VALID_DIR, f"{captcha_id}.json")
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
        os.makedirs(VALID_DIR, exist_ok=True)
        target_path = os.path.join(VALID_DIR, f"{captcha_id}.json")
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.remove(source_path)
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
            puzzle = data.get("puzzle", data)
            tiles = puzzle.get("tiles", [])
            variants = puzzle.get("variantsCapture", [])
            valid_index = get_valid_variant_index(data)
            generated = assemble_captchas(tiles, variants, valid_index)
            push_sse(
                {
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
            )
            time.sleep(1)

    t = threading.Thread(target=send_captchas, daemon=True)
    t.start()
    return len(captcha_ids)
