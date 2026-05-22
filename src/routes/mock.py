"""
EOPP Captcha Solver - Mock EOPP API Routes

Mock эндпоинты EOPP API для тестирования:
- POST /reservations-api/v1/captcha - генерация капчи
- POST /reservations-api/v1/captcha-validate - валидация капчи
- GET /reservations-api/v1/timeslot/AvailableSlots - доступные слоты
- POST /reservations-api/v1/Reschedule - перенос брони
- POST /reservations-api/v1/SubmitDraft - создание брони

Конфигурация:
- POST /mock-config - настройка поведения эндпоинтов
- GET /mock-config - получить текущую конфигурацию
- DELETE /mock-config - сбросить конфигурацию

Поддерживаемые modes: success, 429, 400, all_occupied, all_slots_occupied, custom
"""

import os
import random
import threading
from typing import Any
import json 
from fastapi import Query, Request
from fastapi.responses import JSONResponse

from src.constants import VALID_DIR
from src.schemas.captcha import GenerateCaptchaBody
from src.schemas.common import MockConfigBody

# Mock config store
mock_config: dict[str, dict] = {}
mock_config_lock = threading.Lock()
mock_attempt_counters: dict[str, int] = {}


def _get_mock_response(endpoint: str) -> dict[str, Any] | None:
    with mock_config_lock:
        cfg = mock_config.get(endpoint)
        if not cfg:
            return None

        responses = cfg.get("responses")
        if responses is None:
            mode = cfg.get("mode")
            if mode:
                responses = [mode]
            else:
                return {"mode": "success"}

        counter = mock_attempt_counters.get(endpoint, 0)
        idx = counter % len(responses)
        mock_attempt_counters[endpoint] = counter + 1

        mode = responses[idx]
        result = {"mode": mode}
        if "custom_body" in cfg:
            result["custom_body"] = cfg["custom_body"]
        return result


def _mock_429() -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": "Too Many Requests"},
        headers={"Retry-After": "5"},
    )


def _mock_400(body: dict) -> JSONResponse:
    return JSONResponse(status_code=400, content=body)


def _load_random_captcha() -> dict:
    files = [os.path.join(VALID_DIR, f) for f in os.listdir(VALID_DIR) if f.endswith(".json")]
    if not files:
        return {"error": "No test captcha files found"}
    filepath = random.choice(files)
    with open(filepath) as f:
        return f.read()


def _as_eopp_captcha_v2(data: dict) -> dict:
    puzzle = data.get("puzzle", data)
    return {
        "token": data.get("token", "mock-captcha-token"),
        "front": {
            "tiles": puzzle.get("tiles", []),
            "variantsCapture": puzzle.get("variantsCapture", []),
            "type": puzzle.get("type", 2),
        },
    }


def register_mock_routes(app):
    @app.post("/mock-config")
    async def set_mock_config(body: MockConfigBody):
        with mock_config_lock:
            mock_config.clear()
            mock_attempt_counters.clear()
            for ep, cfg in body.endpoints.items():
                if "mode" in cfg and "responses" not in cfg:
                    cfg["responses"] = [cfg["mode"]]
                mock_config[ep] = cfg
        return JSONResponse(content={"ok": True, "endpoints": dict(mock_config)})

    @app.get("/mock-config")
    async def get_mock_config():
        with mock_config_lock:
            normalized = {}
            for ep, cfg in mock_config.items():
                if "responses" not in cfg and "mode" in cfg:
                    normalized[ep] = {"responses": [cfg["mode"]]}
                else:
                    normalized[ep] = cfg
            return JSONResponse(
                content={
                    "endpoints": normalized,
                    "counters": dict(mock_attempt_counters),
                }
            )

    @app.delete("/mock-config")
    async def reset_mock_config():
        with mock_config_lock:
            mock_config.clear()
            mock_attempt_counters.clear()
        return JSONResponse(content={"ok": True, "endpoints": {}})

    @app.post("/reservations-api/v1/captcha")
    async def mock_captcha(body: GenerateCaptchaBody):
        cfg = _get_mock_response("/reservations-api/v1/captcha")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get(
                    "custom_body",
                    {"title": "CaptchaGenerationError", "eoppStatus": 40001},
                )
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        data = _load_random_captcha()
        if data:
            data = json.loads(data)
        if isinstance(data, dict) and "error" in data:
            return JSONResponse(status_code=500, content=data)
        return JSONResponse(content=_as_eopp_captcha_v2(data))

    @app.post("/reservations-api/v1/captcha-validate")
    async def mock_captcha_validate(request: Request):
        body = await request.json()
        cfg = _get_mock_response("/reservations-api/v1/captcha-validate")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "InvalidCaptcha", "eoppStatus": 40002})
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={
                "isValid": True,
                "successToken": "mock-success-token-" + (body.get("captchaToken", "") or "")[:10],
            }
        )

    @app.get("/reservations-api/v1/timeslot/AvailableSlots")
    async def mock_available_slots(
        facilityId: str = Query(None),
        vehicleId: str = Query(None),
        date: str = Query(None),
        transportType: int = Query(None),
        isCreateReservation: bool = Query(None),
        reservationId: str = Query(None),
    ):
        cfg = _get_mock_response("/reservations-api/v1/timeslot/AvailableSlots")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(cfg.get("custom_body", {"title": "SlotsError", "eoppStatus": 40003}))
        if cfg and cfg.get("mode") == "all_occupied":
            return JSONResponse(
                content={
                    "slots": [
                        {
                            "id": "slot-mock-1",
                            "time": "06:00",
                            "count": 0,
                            "slotCaption": "06:00 - 07:00",
                            "intervalIndex": 1,
                        },
                        {
                            "id": "slot-mock-2",
                            "time": "08:00",
                            "count": 0,
                            "slotCaption": "08:00 - 09:00",
                            "intervalIndex": 2,
                        },
                        {
                            "id": "slot-mock-3",
                            "time": "10:00",
                            "count": 0,
                            "slotCaption": "10:00 - 11:00",
                            "intervalIndex": 3,
                        },
                    {
                        "id": "slot-mock-4",
                        "time": "11:00",
                        "count": 0,
                        "slotCaption": "11:00 - 12:00",
                        "intervalIndex": 4,
                    },{
                        "id": "slot-mock-5",
                        "time": "16:00",
                        "count": 0,
                        "slotCaption": "16:00 - 17:00",
                        "intervalIndex": 4,
                    },
                    ]
                }
            )
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {"slots": []}))
        return JSONResponse(
            content={
                "slots": [
                    {
                        "id": "slot-mock-1",
                        "time": "06:00",
                        "count": 3,
                        "slotCaption": "06:00 - 07:00",
                        "intervalIndex": 1,
                    },
                    {
                        "id": "slot-mock-2",
                        "time": "08:00",
                        "count": 5,
                        "slotCaption": "08:00 - 90:00",
                        "intervalIndex": 2,
                    },
                    {
                        "id": "slot-mock-3",
                        "time": "10:00",
                        "count": 2,
                        "slotCaption": "10:00 - 11:00",
                        "intervalIndex": 3,
                    },
                    {
                        "id": "slot-mock-4",
                        "time": "11:00",
                        "count": 2,
                        "slotCaption": "11:00 - 12:00",
                        "intervalIndex": 4,
                    },  {
                        "id": "slot-mock-5",
                        "time": "16:00",
                        "count": 2,
                        "slotCaption": "16:00 - 17:00",
                        "intervalIndex": 4,
                    },
                ]
            }
        )

    @app.post("/reservations-api/v1/Reschedule")
    async def mock_reschedule(request: Request):
        await request.json()
        cfg = _get_mock_response("/reservations-api/v1/Reschedule")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "RescheduleError", "eoppStatus": 40004})
            )
        if cfg and cfg.get("mode") == "all_slots_occupied":
            return _mock_400({"title": "AllSlotsOccupiedOnInterval", "eoppStatus": 40001})
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={"title": "RescheduleSuccess", "eoppStatus": 20118, "isSuccess": True}
        )

    @app.post("/reservations-api/v1/SubmitDraft")
    async def mock_submit_draft(request: Request):
        await request.json()
        cfg = _get_mock_response("/reservations-api/v1/SubmitDraft")
        if cfg and cfg.get("mode") == "429":
            return _mock_429()
        if cfg and cfg.get("mode") == "400":
            return _mock_400(
                cfg.get("custom_body", {"title": "SubmitDraftError", "eoppStatus": 40005})
            )
        if cfg and cfg.get("mode") == "all_slots_occupied":
            return _mock_400({"title": "AllSlotsOccupiedOnInterval", "eoppStatus": 40001})
        if cfg and cfg.get("mode") == "custom":
            return JSONResponse(status_code=200, content=cfg.get("custom_body", {}))
        return JSONResponse(
            content={"title": "SubmitReservationSuccess", "eoppStatus": 20117, "isSuccess": True}
        )
