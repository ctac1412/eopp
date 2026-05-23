"""Captcha image assembly and hashing utilities."""

import base64
import hashlib
import io
import json

from PIL import Image, ImageDraw, ImageFont

from captcha_solver import solve_captcha


def get_by_path(obj: dict | None, *keys, default=None):
    current = obj
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
        if current is default:
            return default
    return current


def captcha_hash(data):
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    variants = puzzle.get("variantsCapture", [])
    hash_input = json.dumps({"tiles": tiles, "variants": variants}, sort_keys=True)
    return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


def get_valid_variant_index(data: dict) -> int | None:
    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    valid_index = data.get("valid_index")

    if not isinstance(valid_index, int):
        return None
    if valid_index < 0 or valid_index >= len(variants):
        return None
    return valid_index


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
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica-Bold.ttc", 80)
            except OSError:
                try:
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 80)
                except OSError:
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
