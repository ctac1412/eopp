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
