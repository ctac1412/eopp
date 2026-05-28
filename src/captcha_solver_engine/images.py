"""Common image generation helpers for captcha variants."""

from __future__ import annotations

import base64
import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont


def assemble_captchas(
    tiles: list[dict[str, Any]],
    variants: list[list[str]],
    valid_index: int | None = None,
) -> list[dict[str, Any]]:
    """Build preview PNGs for captcha variants."""
    tile_map = {}
    for tile in tiles:
        tile_id = tile["tileId"]
        img_data = base64.b64decode(tile["imageData"])
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


def _clean_b64(b64_data: str) -> str:
    if not b64_data:
        return ""
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]
    return b64_data.strip()


def _decode_b64_image(b64_data: str) -> Image.Image | None:
    cleaned = _clean_b64(b64_data)
    if not cleaned:
        return None
    try:
        img_bytes = base64.b64decode(cleaned, validate=True)
    except Exception:
        try:
            img_bytes = base64.b64decode(cleaned, validate=False)
        except Exception:
            return None
    try:
        return Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    except Exception:
        return None


def assemble_icon_click_preview(
    main_b64: str,
    icons_b64: str,
    coordinates: list[dict] | None = None,
) -> list[dict[str, Any]]:
    """Build preview for icon-click captcha — main image + icons strip."""
    main_img = _decode_b64_image(main_b64)
    icons_img = _decode_b64_image(icons_b64)

    result: dict[str, Any] = {
        "index": 0,
        "image": "",
        "icons": "",
        "has_coords": False,
    }

    if main_img:
        combined = main_img.copy()
        if coordinates:
            draw = ImageDraw.Draw(combined)
            for i, coord in enumerate(coordinates):
                x, y = coord["x"], coord["y"]
                r = 18
                color = (255, 50, 50, 220) if i == 0 else (50, 50, 255, 180)
                draw.ellipse((x - r, y - r, x + r, y + r), outline=color, width=3)
                try:
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
                except OSError:
                    font = ImageFont.load_default()
                draw.text((x - r - 4, y - r - 4), str(i + 1), fill=color[:3] + (255,), font=font)
            result["has_coords"] = True

        buf = io.BytesIO()
        combined.save(buf, format="PNG")
        result["image"] = base64.b64encode(buf.getvalue()).decode()

    if icons_img:
        buf = io.BytesIO()
        icons_img.save(buf, format="PNG")
        result["icons"] = base64.b64encode(buf.getvalue()).decode()

    return [result]
