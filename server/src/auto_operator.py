"""Auto-operator: rucaptcha-based parallel icon solver.

Dispatched at captcha registration time.
Uses rucaptcha API v2 (createTask) with pingback/callbackUrl for results.
No polling — rucaptcha calls our webhook when solved.

Image format:
  - body: main captcha image (base64)
  - imgInstructions: individual icon to find (base64)

Environment:
  RUCAPTCHA_API_KEY          — API key for rucaptcha.com
  RUCAPTCHA_CALLBACK_URL     — full URL for webhook, e.g. https://myserver.com/rucaptcha-callback
  EOPP_AUTO_SOLVER_ENABLED   — set to "0" to disable globally
"""

import asyncio
import base64
import io
import json
import logging
import os
import time
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from src.constants import AUTO_SOLVER_ORDER

logger = logging.getLogger("eopp.auto_operator")

RUCAPTCHA_API_KEY = os.environ.get("RUCAPTCHA_API_KEY", "")
RUCAPTCHA_CALLBACK_URL = os.environ.get("RUCAPTCHA_CALLBACK_URL", "")
RUCAPTCHA_CREATE_TASK = "https://api.rucaptcha.com/createTask"

AUTO_OPERATOR_ID = -1
AUTO_SOLVER_ENABLED = os.environ.get("EOPP_AUTO_SOLVER_ENABLED", "0") != "0"

# task_id → {captcha_id, icon_pos, master_key_id, created_at}
_pending_callbacks: dict[str, dict] = {}
_lock = asyncio.Lock()


def _compose_instruction_image(main_b64: str, icon_b64: str, icon_pos: int) -> str:
    """Compose main image + target icon + instruction text into a single base64 PNG."""
    main_bytes = base64.b64decode(main_b64)
    icon_bytes = base64.b64decode(icon_b64)

    main_img = Image.open(io.BytesIO(main_bytes)).convert("RGBA")
    icon_img = Image.open(io.BytesIO(icon_bytes)).convert("RGBA")

    main_w, main_h = main_img.size

    icon_scale = 120
    icon_ratio = icon_scale / icon_img.width
    icon_new_h = int(icon_img.height * icon_ratio)
    icon_scaled = icon_img.resize((icon_scale, icon_new_h), Image.LANCZOS)

    footer_h = max(icon_new_h + 60, 140)
    canvas = Image.new("RGBA", (main_w, main_h + footer_h), (30, 30, 30, 255))
    canvas.paste(main_img, (0, 0))

    draw = ImageDraw.Draw(canvas)
    draw.line([(0, main_h), (main_w, main_h)], fill=(255, 255, 255, 100), width=2)

    text = f"Иконка #{icon_pos + 1} — нажмите на неё на картинке сверху"
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (main_w - text_w) // 2
    draw.text((text_x, main_h + 8), text, fill=(255, 255, 255, 255), font=font)

    icon_x = (main_w - icon_scale) // 2
    icon_y = main_h + 34
    canvas.paste(icon_scaled, (icon_x, icon_y), icon_scaled)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


async def _create_task(image_b64: str, comment: str) -> str | None:
    """Submit CoordinatesTask to rucaptcha API v2 with callbackUrl."""
    if not RUCAPTCHA_API_KEY:
        logger.warning("rucaptcha_api_key_not_set")
        return None

    import httpx

    logger.info(
        "rucaptcha_create_request url=%s callback=%s image_len=%d comment=%s",
        RUCAPTCHA_CREATE_TASK,
        RUCAPTCHA_CALLBACK_URL or "(not set)",
        len(image_b64),
        comment,
    )

    real_payload = {
        "clientKey": RUCAPTCHA_API_KEY,
        "task": {
            "type": "CoordinatesTask",
            "body": image_b64,
            "comment": comment,
            "minClicks": 1,
            "maxClicks": 1,
        },
        "language": "ru",
    }
    if RUCAPTCHA_CALLBACK_URL:
        real_payload["callbackUrl"] = RUCAPTCHA_CALLBACK_URL

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                RUCAPTCHA_CREATE_TASK,
                json=real_payload,
                timeout=30,
            )
            resp_text = resp.text
            logger.info("rucaptcha_create_response status=%d body=%s", resp.status_code, resp_text[:500])
            data = resp.json()
            if data.get("errorId") == 0:
                task_id = str(data.get("taskId", ""))
                logger.info("rucaptcha_task_created task_id=%s", task_id)
                return task_id
            else:
                logger.warning(
                    "rucaptcha_create_error code=%s desc=%s",
                    data.get("errorCode"), data.get("errorDescription"),
                )
                return None
    except Exception as exc:
        logger.warning("rucaptcha_create_exception %s", exc)
        return None


def _resize_icon(icon_b64: str, max_size: int = 200) -> str:
    """Resize icon to be clearly visible for rucaptcha workers. Keeps aspect ratio."""
    try:
        icon_bytes = base64.b64decode(icon_b64)
        img = Image.open(io.BytesIO(icon_bytes)).convert("RGBA")
        w, h = img.size
        if max(w, h) >= max_size:
            return icon_b64  # already big enough
        ratio = max_size / max(w, h)
        new_w, new_h = int(w * ratio), int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:
        logger.warning("resize_icon_failed %s", exc)
        return icon_b64


async def _submit_icon(
    captcha_id: str,
    icon_pos: int,
    main_b64: str,
    icon_b64: str,
    master_key_id: int,
) -> None:
    """Create rucaptcha task for a single icon. Result comes via webhook callback."""
    icon_b64 = _resize_icon(icon_b64)
    composed = _compose_instruction_image(main_b64, icon_b64, icon_pos)
    comment = f"Нажмите на иконку #{icon_pos + 1} (показана снизу) на картинке сверху"

    task_id = await _create_task(composed, comment)
    if not task_id:
        logger.warning("auto_solve_create_failed captcha=%s icon=%d", captcha_id, icon_pos)
        return

    async with _lock:
        _pending_callbacks[task_id] = {
            "captcha_id": captcha_id,
            "icon_pos": icon_pos,
            "master_key_id": master_key_id,
            "created_at": time.time(),
        }

    logger.info(
        "auto_solve_dispatched captcha=%s icon=%d task_id=%s callback=%s",
        captcha_id, icon_pos, task_id, bool(RUCAPTCHA_CALLBACK_URL),
    )


async def handle_callback(task_id: str, code: str) -> None:
    """Process rucaptcha webhook callback. Called from routes/callback.py.

    Parses the solution, finds the pending task mapping, and submits
    the answer to distribution state with operator_id=-1.
    """
    async with _lock:
        entry = _pending_callbacks.pop(task_id, None)

    if not entry:
        logger.warning("rucaptcha_callback_unknown_task task_id=%s", task_id)
        return

    captcha_id = entry["captcha_id"]
    icon_pos = entry["icon_pos"]
    master_key_id = entry["master_key_id"]

    coords = _parse_coordinates_code(code)
    if not coords:
        logger.warning(
            "rucaptcha_callback_bad_code task_id=%s code=%s", task_id, code[:200]
        )
        return

    logger.info(
        "auto_solve_answer captcha=%s icon=%d x=%d y=%d task_id=%s",
        captcha_id, icon_pos, coords["x"], coords["y"], task_id,
    )

    from src.routes.distribution import distribution_states, handle_distribution_answer
    from src.models import DistributionAnswerBody
    from src.sse import push_sse

    state = distribution_states.get(captcha_id)
    if not state:
        return

    race_won = icon_pos not in state.get("all_answers", {})

    push_sse({
        "type": "auto_solve_result",
        "captcha_id": captcha_id,
        "icon_position": icon_pos,
        "x": coords["x"],
        "y": coords["y"],
        "race_won": race_won,
    }, api_key_id=master_key_id)

    if not race_won:
        logger.info("auto_solve_race_lost captcha=%s icon=%d", captcha_id, icon_pos)
        return

    body = DistributionAnswerBody(
        captcha_id=captcha_id,
        operator_id=AUTO_OPERATOR_ID,
        icon_position=icon_pos,
        x=coords["x"],
        y=coords["y"],
    )
    await handle_distribution_answer(body)


def _parse_coordinates_code(code: str) -> dict[str, int] | None:
    """Parse rucaptcha webhook code into {x, y} dict.

    Handles formats:
      - coordinates:x=123,y=456
      - x=123,y=456
      - JSON: [{"x":123,"y":456}]
      - Comma: 123,456
    """
    code = code.strip()
    if not code:
        return None

    # coordinates:x=123,y=456 or x=123,y=456
    if "=" in code and "," in code:
        if code.startswith("coordinates:"):
            code = code[len("coordinates:"):]
        parts = {}
        for kv in code.split(","):
            if "=" in kv:
                k, v = kv.split("=", 1)
                parts[k.strip()] = v.strip()
        if "x" in parts and "y" in parts:
            try:
                return {"x": int(parts["x"]), "y": int(parts["y"])}
            except ValueError:
                pass

    if code.startswith("{"):
        try:
            data = json.loads(code)
            coords = data.get("coordinates", data)
            if isinstance(coords, list) and coords:
                return {"x": int(coords[0]["x"]), "y": int(coords[0]["y"])}
            if isinstance(coords, dict) and "x" in coords:
                return {"x": int(coords["x"]), "y": int(coords["y"])}
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            pass

    if code.startswith("["):
        try:
            data = json.loads(code)
            if isinstance(data, list) and data:
                return {"x": int(data[0]["x"]), "y": int(data[0]["y"])}
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            pass

    parts = code.split(",")
    if len(parts) == 2:
        try:
            return {"x": int(parts[0].strip()), "y": int(parts[1].strip())}
        except ValueError:
            pass

    return None


def dispatch_auto_solve(
    captcha_id: str,
    num_operators: int,
    icons_cache: dict[int, dict],
) -> None:
    """Dispatch auto-solver tasks for a new captcha. Called from captcha.py during registration.

    Spawns background asyncio tasks for each icon in AUTO_SOLVER_ORDER[num_operators].
    Each task creates a rucaptcha CoordinatesTask with callbackUrl.
    Results arrive via POST /rucaptcha-callback → handle_callback().
    """
    if not AUTO_SOLVER_ENABLED:
        logger.info("auto_solve_disabled_by_config")
        return

    positions = AUTO_SOLVER_ORDER.get(num_operators, [])
    if not positions:
        return

    main_b64 = icons_cache.get(0, {}).get("image", "")
    if not main_b64:
        return

    # Small delay to let captcha.py store the distribution state
    async def _delayed_dispatch():
        await asyncio.sleep(0.1)
        from src.routes.distribution import distribution_states
        from src.sse import push_sse

        state = distribution_states.get(captcha_id)
        if not state:
            return
        master_key_id = state.get("api_key_id")

        tasks = []
        for pos in positions:
            icon_data = icons_cache.get(pos, {})
            icon_b64 = icon_data.get("icon", "")
            if not icon_b64:
                continue
            task = asyncio.create_task(
                _submit_icon(captcha_id, pos, main_b64, icon_b64, master_key_id)
            )
            tasks.append(task)

        push_sse({
            "type": "auto_solve_dispatched",
            "captcha_id": captcha_id,
            "icon_positions": positions,
            "num_operators": num_operators,
        }, api_key_id=master_key_id)

        logger.info(
            "auto_solve_dispatched captcha=%s icons=%s tasks=%d",
            captcha_id, positions, len(tasks),
        )

    asyncio.create_task(_delayed_dispatch())


def cancel_auto_solve(captcha_id: str) -> None:
    """Remove all pending callbacks for a captcha (e.g. on timeout)."""
    to_remove = []
    for task_id, entry in list(_pending_callbacks.items()):
        if entry.get("captcha_id") == captcha_id:
            to_remove.append(task_id)
    for task_id in to_remove:
        _pending_callbacks.pop(task_id, None)
    if to_remove:
        logger.info("auto_solve_cancelled captcha=%s tasks=%d", captcha_id, len(to_remove))
