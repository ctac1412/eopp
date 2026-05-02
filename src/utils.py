import json
import base64
import hashlib
import threading
import time
import io
import os
import sys
import glob
import asyncio
import ssl
import http.client
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

from src.constants import (
    PORT,
    VALID_DIR,
    NO_VALID_DIR,
    ADMIN_TOKEN,
)

pending = {}
sse_queues: dict[int | None, list[asyncio.Queue]] = {}
sse_connections: list[dict] = []
lock = threading.Lock()
result_counter = 0
counter_lock = threading.Lock()
source_files = {}
_benchmark_cache: dict | None = None

from captcha_solver import solve_captcha


def captcha_hash(data):
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    hash_input = json.dumps({"tiles": tiles, "variants": variants}, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def assemble_captchas(tiles, variants, valid_index=None):
    tile_map = {}
    for t in tiles:
        tile_id = t["tileId"]
        img_data = base64.b64decode(t["imageData"])
        img = Image.open(io.BytesIO(img_data)).convert("RGBA")
        tile_map[tile_id] = img

    generated = []
    for idx, tile_ids in enumerate(variants):
        images = [tile_map[tid] for tid in tile_ids if tid in tile_map]
        if len(images) != len(tile_ids):
            continue

        w, h = images[0].size
        cols = min(len(images), 3)
        rows = (len(images) + cols - 1) // cols
        canvas = Image.new("RGBA", (w * cols, h * rows), (255, 255, 255, 255))
        for i, img in enumerate(images):
            row = i // cols
            col = i % cols
            canvas.paste(img, (col * w, row * h))

        if valid_index is not None and idx == valid_index:
            draw = ImageDraw.Draw(canvas)
            text = "100%"
            try:
                font = ImageFont.truetype(
                    "/System/Library/Fonts/Helvetica-Bold.ttc", 80
                )
            except (OSError, IOError):
                try:
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 80)
                except (OSError, IOError):
                    font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            x = (canvas.width - text_w) // 2
            y = (canvas.height - text_h) // 2
            draw.text((x, y), text, fill=(255, 0, 0, 255), font=font)

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        generated.append({"index": idx, "tiles": tile_ids, "image": b64})

    return generated


def get_top3_from_solver(data):
    try:
        best_variant, _, results = solve_captcha(data)
        return [str(r["variant"]) for r in results[:3]]
    except Exception:
        return []


def push_sse(msg, api_key_id=None):
    data = f"data: {json.dumps(msg)}\n\n"
    dead_queues = []
    with lock:
        if api_key_id is not None:
            queues = sse_queues.get(api_key_id, [])
        else:
            queues = []
            for v in sse_queues.values():
                queues.extend(v)
        for q in queues:
            try:
                q.put_nowait(data)
            except Exception:
                dead_queues.append(q)
        for q in dead_queues:
            for v in sse_queues.values():
                if q in v:
                    v.remove(q)


def register_sse_connection(api_key_id: int | None, ip: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    with lock:
        sse_queues.setdefault(api_key_id, []).append(q)
        sse_connections.append(
            {
                "queue": q,
                "api_key_id": api_key_id,
                "ip": ip,
                "connected_at": time.time(),
            }
        )
    return q


def unregister_sse_connection(q: asyncio.Queue, api_key_id: int | None):
    with lock:
        queues_for_key = sse_queues.get(api_key_id, [])
        if q in queues_for_key:
            queues_for_key.remove(q)
        sse_connections[:] = [c for c in sse_connections if c["queue"] is not q]


def get_connected_streams() -> list[dict]:
    from src.api_keys import get_key_by_id

    with lock:
        result = []
        for c in sse_connections:
            key_info = get_key_by_id(c["api_key_id"]) if c["api_key_id"] else None
            result.append(
                {
                    "api_key_id": c["api_key_id"],
                    "api_key_label": key_info["label"] if key_info else None,
                    "ip": c["ip"],
                    "connected_at": c["connected_at"],
                    "connected_at_iso": datetime.fromtimestamp(
                        c["connected_at"], tz=timezone.utc
                    ).isoformat()
                    if c["connected_at"]
                    else None,
                }
            )
    return result


def get_test_stats() -> dict:
    labeled = (
        len([f for f in os.listdir(VALID_DIR) if f.endswith(".json")])
        if os.path.isdir(VALID_DIR)
        else 0
    )
    unlabeled = (
        len([f for f in os.listdir(NO_VALID_DIR) if f.endswith(".json")])
        if os.path.isdir(NO_VALID_DIR)
        else 0
    )
    return {"labeled_count": labeled, "unlabeled_count": unlabeled}


def _run_benchmark_sync():
    import numpy as np
    from captcha_solver import (
        prepare_clean_tiles,
        calculate_seam_discontinuity,
        calculate_content_coherence,
        calculate_seam_ssim,
        calculate_sobel_continuity,
    )

    test_files = sorted(glob.glob(os.path.join(VALID_DIR, "*.json")))
    total = len(test_files)
    if total == 0:
        return {
            "total": 0,
            "passed": 0,
            "coverage_percent": 0,
            "best_config": None,
        }

    all_data = []
    for filepath in test_files:
        with open(filepath) as f:
            data = json.load(f)
        expected = data["valid_index"]
        variants = data["puzzle"]["variantsCapture"]
        images_dict = prepare_clean_tiles(data["puzzle"]["tiles"])
        nv = len(variants)
        metrics = np.zeros((5, nv, 4))
        for et in range(5):
            et_val = et + 1
            for i, variant in enumerate(variants):
                metrics[et, i] = [
                    calculate_seam_discontinuity(variant, images_dict, et_val),
                    calculate_content_coherence(variant, images_dict, et_val),
                    calculate_seam_ssim(variant, images_dict, et_val),
                    calculate_sobel_continuity(variant, images_dict, et_val),
                ]
        all_data.append((os.path.basename(filepath), expected, nv, metrics))

    best_correct = 0
    best_config = None
    for wd in [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10]:
        for ws in [100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000]:
            for wc in [5, 10, 15, 20, 30, 40, 50, 80, 100, 150, 200]:
                for wb in [0.1, 0.3, 0.5, 0.8, 1, 2, 5]:
                    for et in range(5):
                        correct = 0
                        for fname, expected, nv, metrics in all_data:
                            disc = metrics[et, :, 0]
                            coh = metrics[et, :, 1]
                            ssim_v = metrics[et, :, 2]
                            sobel = metrics[et, :, 3]
                            scores = (
                                disc * wd + (1 - ssim_v) * ws - coh * wc + sobel * wb
                            )
                            best_v = int(np.argmin(scores))
                            if best_v == expected:
                                correct += 1
                        if correct > best_correct:
                            best_correct = correct
                            best_config = (et + 1, wd, ws, wc, wb)

    et, wd, ws, wc, wb = best_config
    pct = best_correct / total * 100
    return {
        "total": total,
        "passed": best_correct,
        "coverage_percent": round(pct, 1),
        "best_config": {
            "edge_trim": et,
            "W_DISC": wd,
            "W_SSIM": ws,
            "W_COH": wc,
            "W_SOBEL": wb,
        },
    }


def run_benchmark_cached() -> dict:
    global _benchmark_cache
    now = time.time()

    if _benchmark_cache and (now - _benchmark_cache["_cached_at"]) < 300:
        return {k: v for k, v in _benchmark_cache.items() if not k.startswith("_")}

    try:
        bench_data = _run_benchmark_sync()
        _benchmark_cache = {
            **bench_data,
            "_cached_at": now,
            "last_run_timestamp": datetime.fromtimestamp(
                now, tz=timezone.utc
            ).isoformat(),
        }
        return {k: v for k, v in _benchmark_cache.items() if not k.startswith("_")}
    except Exception as e:
        return {
            "error": str(e),
            "last_run_timestamp": datetime.fromtimestamp(
                now, tz=timezone.utc
            ).isoformat(),
        }


def next_result_id():
    global result_counter
    with counter_lock:
        result_counter += 1
        return result_counter


def _http_post(path, body, extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    from src import constants

    if constants.use_ssl:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx, timeout=5)
    else:
        conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)

    conn.request("POST", path, body=body, headers=headers)
    resp = conn.getresponse()
    resp.read()
    conn.close()
    return resp


def send_test_cases():
    pattern = os.path.join(VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No test files found in {VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath, "r") as f:
            body = f.read()
        print(f"Sending test: {os.path.basename(filepath)}")
        t = threading.Thread(
            target=_send_captcha, args=(body, ADMIN_TOKEN), daemon=True
        )
        t.start()
        time.sleep(1)


def send_write_cases():
    pattern = os.path.join(NO_VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No unlabelled test files found in {NO_VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath, "r") as f:
            body = f.read()
        data = json.loads(body)
        captcha_id = captcha_hash(data)
        source_files[captcha_id] = filepath
        print(f"Sending for labeling: {os.path.basename(filepath)} [{captcha_id}]")
        t = threading.Thread(
            target=_send_captcha_with_id,
            args=(captcha_id, body, ADMIN_TOKEN),
            daemon=True,
        )
        t.start()
        time.sleep(1)


def _send_captcha(body, admin_token, api_key=None):
    try:
        if api_key is None:
            from src.constants import get_test_api_key

            api_key = get_test_api_key()

        data = json.loads(body)
        data["api_key"] = api_key
        wrapped_body = json.dumps(data)
        _http_post(
            path="/solve-captcha",
            body=wrapped_body,
            extra_headers={"X-Admin-Token": admin_token},
        )

    # class SolveCaptchaBody(BaseModel):
    #     api_key: str
    #     auto_solve: bool = False
    #     captcha_id: Optional[str] = None
    #     reservation_id: Optional[str] = None
    #     type: Optional[int] = None
    #     token: Optional[str] = None
    #     silhouette: Optional[str] = None
    #     puzzle: Optional[dict[str, Any]] = None
    #     valid_index: Optional[int] = None

    except Exception as e:
        print(f"Error sending test captcha: {e}")


def _send_captcha_with_id(captcha_id, body, admin_token, api_key=None):
    try:
        if api_key is None:
            from src.constants import get_test_api_key

            api_key = get_test_api_key()

        wrapper = {
            "captcha_id": captcha_id,
            "data": json.loads(body),
            "api_key": api_key,
        }
        _http_post(
            "/solve-captcha",
            json.dumps(wrapper),
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")


def send_test_cases_with_key(api_key=None):
    pattern = os.path.join(VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No test files found in {VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath, "r") as f:
            body = f.read()
        print(f"Sending test: {os.path.basename(filepath)}")
        t = threading.Thread(
            target=_send_captcha, args=(body, ADMIN_TOKEN, api_key), daemon=True
        )
        t.start()
        time.sleep(1)
