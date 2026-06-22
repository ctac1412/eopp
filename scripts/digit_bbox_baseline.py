"""Find candidate digit bounding boxes on digit-labeled captcha tiles.

This is an offline experiment. It reads local captcha JSON files and writes
reports/contact sheets under server/data/digit_bbox_experiments without
modifying runtime code or database rows.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import sqlite3
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
DB_PATH = SERVER / "data" / "api_keys.db"
OUT_ROOT = SERVER / "data" / "digit_bbox_experiments"

sys.path.insert(0, str(SERVER))

from src.captcha_assembly import get_valid_variant_index, is_icon_click_type  # noqa: E402


@dataclass
class BBoxCandidate:
    x: int
    y: int
    w: int
    h: int
    score: float
    source: str
    area_ratio: float


def _read_rows(limit: int | None = None) -> list[sqlite3.Row]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    query = """
        select id, captcha_id, classification, captcha_type, valid_index,
               solver_valid_rank, variants_count, file_path, action_date,
               created_at, last_seen_at
        from captcha_files
        where classification = 'digit'
        order by id desc
    """
    if limit is not None:
        query += " limit ?"
        rows = conn.execute(query, (limit,)).fetchall()
    else:
        rows = conn.execute(query).fetchall()
    conn.close()
    return rows


def _load_json(row: sqlite3.Row) -> tuple[Path, dict[str, Any]]:
    path = Path(row["file_path"]) if row["file_path"] else SERVER / "data" / "captcha_examples" / "all" / f"{row['captcha_id']}.json"
    if not path.is_absolute():
        path = ROOT / path
    with open(path, encoding="utf-8") as f:
        return path, json.load(f)


def _decode_tile(tile: dict[str, Any]) -> Image.Image:
    raw = base64.b64decode(tile["imageData"])
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _merge_nearby_boxes(boxes: list[tuple[int, int, int, int]], pad: int, shape: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    if not boxes:
        return []
    h, w = shape
    mask = np.zeros((h, w), dtype=np.uint8)
    for x, y, bw, bh in boxes:
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(w, x + bw + pad)
        y1 = min(h, y + bh + pad)
        mask[y0:y1, x0:x1] = 255
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    merged = [cv2.boundingRect(c) for c in contours]
    return merged


def _candidate_score(gray: np.ndarray, hsv: np.ndarray, box: tuple[int, int, int, int], source: str) -> tuple[float, float]:
    x, y, w, h = box
    img_h, img_w = gray.shape
    area_ratio = (w * h) / float(img_w * img_h)
    roi_gray = gray[y : y + h, x : x + w]
    roi_hsv = hsv[y : y + h, x : x + w]
    sat_mean = float(np.mean(roi_hsv[:, :, 1])) / 255.0 if roi_hsv.size else 0.0
    contrast = float(np.std(roi_gray)) / 128.0 if roi_gray.size else 0.0
    height_score = min(h / max(1, img_h * 0.45), 1.2)
    width_penalty = max(0.0, (w / img_w) - 0.55)
    area_penalty = max(0.0, area_ratio - 0.22)
    border_penalty = 0.0
    if x <= 2 or y <= 2 or x + w >= img_w - 2 or y + h >= img_h - 2:
        border_penalty = 0.35
    source_bonus = {"saturation": 0.35, "dark_outline": 0.2, "edges": 0.05}.get(source, 0.0)
    score = (
        source_bonus
        + 0.9 * sat_mean
        + 0.7 * min(contrast, 1.2)
        + 0.45 * height_score
        - 1.4 * width_penalty
        - 1.6 * area_penalty
        - border_penalty
    )
    return score, area_ratio


def find_digit_candidates(image: Image.Image) -> list[BBoxCandidate]:
    """Return candidate boxes for a digit-like object in one tile."""

    rgb = np.array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    img_h, img_w = gray.shape
    min_area = img_w * img_h * 0.006
    max_area = img_w * img_h * 0.35

    masks: list[tuple[str, np.ndarray]] = []
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    masks.append(("saturation", cv2.inRange(hsv, np.array([0, 55, 35]), np.array([179, 255, 255]))))
    masks.append(("dark_outline", cv2.inRange(gray, 0, 90)))
    edges = cv2.Canny(gray, 60, 150)
    masks.append(("edges", cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)))

    candidates: list[BBoxCandidate] = []
    for source, mask in masks:
        if source == "saturation":
            mask = cv2.bitwise_and(mask, cv2.inRange(val, 35, 255))
        kernel = np.ones((5, 5), np.uint8)
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        raw_boxes = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area < min_area or area > max_area:
                continue
            if h < img_h * 0.12 or w < img_w * 0.035:
                continue
            if w > img_w * 0.75 or h > img_h * 0.95:
                continue
            raw_boxes.append((x, y, w, h))
        for box in _merge_nearby_boxes(raw_boxes, pad=2, shape=gray.shape):
            score, area_ratio = _candidate_score(gray, hsv, box, source)
            if score < 0.25:
                continue
            x, y, w, h = box
            candidates.append(BBoxCandidate(x, y, w, h, round(score, 4), source, round(area_ratio, 4)))

    candidates.sort(key=lambda c: c.score, reverse=True)
    deduped: list[BBoxCandidate] = []
    for candidate in candidates:
        cx0, cy0, cx1, cy1 = candidate.x, candidate.y, candidate.x + candidate.w, candidate.y + candidate.h
        duplicate = False
        for existing in deduped:
            ex0, ey0, ex1, ey1 = existing.x, existing.y, existing.x + existing.w, existing.y + existing.h
            ix0, iy0 = max(cx0, ex0), max(cy0, ey0)
            ix1, iy1 = min(cx1, ex1), min(cy1, ey1)
            inter = max(0, ix1 - ix0) * max(0, iy1 - iy0)
            union = candidate.w * candidate.h + existing.w * existing.h - inter
            if union > 0 and inter / union > 0.45:
                duplicate = True
                break
        if not duplicate:
            deduped.append(candidate)
        if len(deduped) >= 3:
            break
    return deduped


def _draw_contact_sheet(rows: list[dict[str, Any]], out_path: Path) -> None:
    cell_w = 176
    cell_h = 116
    header_h = 44
    block_h = header_h + cell_h * 3 + 18
    sheet_w = cell_w * 3
    sheet = Image.new("RGB", (sheet_w, max(1, block_h * len(rows))), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for rec in rows:
        title = f"#{rec['db_id']} {rec['captcha_id']} valid={rec['valid_index']} boxes={rec['boxes_found']}/9"
        draw.rectangle((0, y, sheet_w, y + block_h - 1), outline=(210, 210, 210))
        draw.text((6, y + 6), title, fill="black")
        y0 = y + header_h
        for tile in rec["tiles"][:9]:
            img = Image.open(tile["tile_path"]).convert("RGB")
            x = (tile["tile_index"] % 3) * cell_w
            yy = y0 + (tile["tile_index"] // 3) * cell_h
            thumb = img.copy()
            thumb.thumbnail((cell_w - 12, cell_h - 26))
            sheet.paste(thumb, (x + 6, yy + 3))
            overlay = ImageDraw.Draw(sheet)
            scale = thumb.width / img.width if img.width else 1.0
            ox, oy = x + 6, yy + 3
            if tile["best_box"]:
                bx = int(tile["best_box"]["x"] * scale)
                by = int(tile["best_box"]["y"] * scale)
                bw = int(tile["best_box"]["w"] * scale)
                bh = int(tile["best_box"]["h"] * scale)
                overlay.rectangle((ox + bx, oy + by, ox + bx + bw, oy + by + bh), outline=(0, 220, 0), width=2)
                label = f"{tile['best_box']['score']:.2f} {tile['best_box']['source']}"
                color = (0, 128, 0)
            else:
                label = "no box"
                color = (190, 0, 0)
            draw.text((x + 6, yy + cell_h - 20), f"tile {tile['tile_index']}: {label}", fill=color)
        y += block_h
    sheet.save(out_path)


def run(limit: int | None = None, sheet_page_size: int = 8) -> dict[str, Any]:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUT_ROOT / f"run_{ts}"
    tiles_dir = out_dir / "tiles"
    crops_dir = out_dir / "crops"
    sheets_dir = out_dir / "contact_sheets"
    for path in (tiles_dir, crops_dir, sheets_dir):
        path.mkdir(parents=True, exist_ok=True)

    rows = _read_rows(limit)
    report_rows: list[dict[str, Any]] = []
    tile_rows: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    summary = Counter()

    for row in rows:
        try:
            source_path, data = _load_json(row)
        except Exception as exc:
            skipped.append({"captcha_id": row["captcha_id"], "reason": f"load_error: {exc!r}"})
            summary["load_error"] += 1
            continue

        if is_icon_click_type(data):
            skipped.append({"captcha_id": row["captcha_id"], "reason": "icon_click"})
            summary["icon_click"] += 1
            continue
        puzzle = data.get("puzzle", data)
        tiles = puzzle.get("tiles", []) if isinstance(puzzle, dict) else []
        variants = puzzle.get("variantsCapture", []) if isinstance(puzzle, dict) else []
        if not isinstance(tiles, list) or len(tiles) != 9 or not isinstance(variants, list):
            skipped.append({"captcha_id": row["captcha_id"], "reason": "not_9_tile_puzzle"})
            summary["not_9_tile_puzzle"] += 1
            continue

        captcha_dir = tiles_dir / row["captcha_id"]
        crop_dir = crops_dir / row["captcha_id"]
        captcha_dir.mkdir(exist_ok=True)
        crop_dir.mkdir(exist_ok=True)
        rec = {
            "db_id": row["id"],
            "captcha_id": row["captcha_id"],
            "classification": row["classification"],
            "valid_index": get_valid_variant_index(data),
            "solver_valid_rank": row["solver_valid_rank"],
            "source_path": str(source_path),
            "tiles_total": len(tiles),
            "boxes_found": 0,
            "high_conf_boxes": 0,
            "tiles": [],
        }
        for index, tile in enumerate(tiles):
            try:
                image = _decode_tile(tile)
            except Exception as exc:
                tile_rows.append({
                    "captcha_id": row["captcha_id"],
                    "tile_index": index,
                    "error": f"decode_error: {exc!r}",
                })
                continue
            tile_path = captcha_dir / f"tile_{index:02d}.png"
            image.save(tile_path)
            candidates = find_digit_candidates(image)
            best = candidates[0] if candidates else None
            crop_path = None
            if best:
                rec["boxes_found"] += 1
                if best.score >= 1.0:
                    rec["high_conf_boxes"] += 1
                pad = 4
                x0 = max(0, best.x - pad)
                y0 = max(0, best.y - pad)
                x1 = min(image.width, best.x + best.w + pad)
                y1 = min(image.height, best.y + best.h + pad)
                crop_path = crop_dir / f"tile_{index:02d}_crop.png"
                image.crop((x0, y0, x1, y1)).save(crop_path)
            tile_rec = {
                "db_id": row["id"],
                "captcha_id": row["captcha_id"],
                "tile_index": index,
                "tile_id": tile.get("tileId"),
                "tile_path": str(tile_path),
                "crop_path": str(crop_path) if crop_path else None,
                "best_box": asdict(best) if best else None,
                "candidates": [asdict(c) for c in candidates],
                "error": None,
            }
            rec["tiles"].append(tile_rec)
            tile_rows.append(tile_rec)
        summary["captchas"] += 1
        summary[f"boxes_{rec['boxes_found']}"] += 1
        report_rows.append(rec)

    for page_start in range(0, len(report_rows), sheet_page_size):
        page = report_rows[page_start : page_start + sheet_page_size]
        _draw_contact_sheet(page, sheets_dir / f"digit_bbox_{page_start // sheet_page_size + 1:02d}.png")

    summary_data = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "db_path": str(DB_PATH),
        "out_dir": str(out_dir),
        "digit_db_rows": len(rows),
        "captchas_analyzed": len(report_rows),
        "tiles_analyzed": sum(len(r["tiles"]) for r in report_rows),
        "tiles_with_box": sum(1 for tile in tile_rows if tile.get("best_box")),
        "tiles_with_high_conf_box": sum(1 for tile in tile_rows if tile.get("best_box") and tile["best_box"]["score"] >= 1.0),
        "skipped": skipped,
        "summary_counts": dict(summary),
    }
    if summary_data["tiles_analyzed"]:
        summary_data["tile_box_rate"] = summary_data["tiles_with_box"] / summary_data["tiles_analyzed"]
        summary_data["tile_high_conf_box_rate"] = summary_data["tiles_with_high_conf_box"] / summary_data["tiles_analyzed"]

    (out_dir / "report.json").write_text(json.dumps({"summary": summary_data, "captchas": report_rows, "tiles": tile_rows}, ensure_ascii=False, indent=2), encoding="utf-8")

    with open(out_dir / "tiles.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "db_id",
                "captcha_id",
                "tile_index",
                "tile_id",
                "tile_path",
                "crop_path",
                "best_box",
                "error",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(tile_rows)

    with open(out_dir / "summary.txt", "w", encoding="utf-8") as f:
        f.write(f"Digit bbox baseline {ts}\n")
        f.write("=" * 80 + "\n")
        for key, value in summary_data.items():
            if key == "skipped":
                continue
            f.write(f"{key}: {value}\n")
        f.write("\nSkipped:\n")
        for item in skipped:
            f.write(f"  {item}\n")

    return summary_data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--sheet-page-size", type=int, default=8)
    args = parser.parse_args()
    summary = run(limit=args.limit, sheet_page_size=args.sheet_page_size)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
