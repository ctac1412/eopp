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

from PIL import Image, ImageDraw, ImageFont

from src.constants import (
    PORT,
    VALID_DIR,
    NO_VALID_DIR,
    HTML_PATH,
    ADMIN_TOKEN,
)

pending = {}
sse_queues: list[asyncio.Queue] = []
lock = threading.Lock()
result_counter = 0
counter_lock = threading.Lock()
source_files = {}

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


def push_sse(msg):
    data = f"data: {json.dumps(msg)}\n\n"
    dead_queues = []
    with lock:
        for q in sse_queues:
            try:
                q.put_nowait(data)
            except Exception:
                dead_queues.append(q)
        for q in dead_queues:
            sse_queues.remove(q)


def next_result_id():
    global result_counter
    with counter_lock:
        result_counter += 1
        return result_counter


def load_html():
    with open(HTML_PATH, "r", encoding="utf-8") as f:
        return f.read()


def _http_post(path, body, extra_headers=None):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = http.client.HTTPSConnection("127.0.0.1", PORT, context=ctx)
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
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


def _send_captcha(body, admin_token):
    try:
        from src.constants import get_test_api_key

        data = json.loads(body)
        data["api_key"] = get_test_api_key()
        wrapped_body = json.dumps(data)
        _http_post(
            "/solve-captcha",
            wrapped_body,
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")


def _send_captcha_with_id(captcha_id, body, admin_token):
    try:
        from src.constants import get_test_api_key

        wrapper = {
            "captcha_id": captcha_id,
            "data": json.loads(body),
            "api_key": get_test_api_key(),
        }
        _http_post(
            "/solve-captcha",
            json.dumps(wrapper),
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")
