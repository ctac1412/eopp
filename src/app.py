import json
import os
import time
import threading
import asyncio
import webbrowser
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from src.utils import (
    PORT,
    PROJECT_DIR,
    VALID_DIR,
    NO_VALID_DIR,
    CAPTCHA_TIMEOUT,
    source_files,
    pending,
    sse_queues,
    lock,
    assemble_captchas,
    get_top3_from_solver,
    push_sse,
    next_result_id,
    send_test_cases,
    send_write_cases,
    captcha_hash,
)

from captcha_solver import solve_captcha
from src.api_keys import (
    create_key,
    list_keys,
    get_key_by_id,
    update_key,
    delete_key,
    reset_usage,
    validate_key,
    get_key_record,
    get_usage_log_entry,
    log_usage,
    confirm_usage,
    fail_usage,
    list_usages,
)

FRONTEND_DIST = os.path.join(PROJECT_DIR, "frontend", "dist")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN") or 13243546
if not ADMIN_TOKEN:
    admin_token_path = os.path.join(PROJECT_DIR, "data", "admin_token")
    if os.path.exists(admin_token_path):
        with open(admin_token_path) as f:
            ADMIN_TOKEN = f.readline().strip()

ADMIN_TOKEN = str(ADMIN_TOKEN)
PROTECTED_PATHS = (
    "/api-keys",
    "/usage-log",
    "/confirm-usage",
    "/fail-usage",
)


class SolveRequest(BaseModel):
    captcha_id: str
    variantIndex: int


def create_app(use_tests: bool = False, write_mode: bool = False) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if use_tests:
            t = threading.Thread(target=send_test_cases, daemon=True)
            t.start()
        if write_mode:
            t = threading.Thread(target=send_write_cases, daemon=True)
            t.start()
        webbrowser.open(f"https://127.0.0.1:{PORT}")
        yield
        # Release all pending events on shutdown
        with lock:
            for entry in pending.values():
                entry["event"].set()
        pending.clear()

    if write_mode:
        CAPTCHA_TIMEOUT = 99

    app = FastAPI(lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def admin_auth_middleware(request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in PROTECTED_PATHS):
            token = request.headers.get("X-Admin-Token")
            if not token or token != ADMIN_TOKEN:
                return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        response = await call_next(request)
        return response

    @app.get("/stream")
    async def sse_stream():
        q: asyncio.Queue = asyncio.Queue()
        with lock:
            sse_queues.append(q)

        async def event_stream():
            try:
                while True:
                    try:
                        item = await asyncio.wait_for(q.get(), timeout=15.0)
                        yield item
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
            except GeneratorExit:
                pass
            finally:
                with lock:
                    if q in sse_queues:
                        sse_queues.remove(q)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/solve-captcha")
    async def handle_captcha(request: Request):
        raw = await request.json()
        auto_solve = raw.get("auto_solve", False)

        api_key = raw.get("api_key")
        if not api_key:
            return JSONResponse(
                status_code=400,
                content={"error": "api_key is required"},
            )

        validation = validate_key(api_key)
        if not validation["valid"]:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Invalid API key",
                    "reason": validation["reason"],
                },
            )

        if "captcha_id" in raw and "data" in raw:
            captcha_id = raw["captcha_id"]
            data = raw["data"]
        else:
            data = raw
        puzzle = data.get("puzzle", data)
        valid_index = data.get("valid_index")
        tiles = puzzle.get("tiles", [])
        variants = puzzle.get("variantsCapture", [])

        captcha_id = captcha_hash(data)
        reservation_id = (
            raw.get("reservationId") or raw.get("reservation_id") or "unknown"
        )

        usage_log_id = log_usage(api_key, reservation_id, captcha_id)

        has_valid_index = "valid_index" in data
        target_dir = VALID_DIR if has_valid_index else NO_VALID_DIR
        os.makedirs(target_dir, exist_ok=True)
        existing_file = os.path.join(target_dir, f"{captcha_id}.json")
        if not os.path.exists(existing_file):
            with open(existing_file, "w") as f:
                json.dump(data, f, indent=2)
            print(
                f"[{captcha_id}] New captcha saved: {captcha_id}.json -> {os.path.basename(target_dir)}/"
            )

        if auto_solve:
            best_variant, tile_order, results = await asyncio.to_thread(
                solve_captcha, data
            )
            print(
                f"[{captcha_id}] Auto-solve: variant {best_variant}, "
                f"score={results[0]['score']:.2f}"
            )
            return JSONResponse(
                content={
                    "variantIndex": best_variant,
                    "variantTiles": tile_order,
                    "usage_log_id": usage_log_id,
                }
            )

        event = threading.Event()

        generated = await asyncio.to_thread(
            assemble_captchas, tiles, variants, valid_index
        )
        top3 = await asyncio.to_thread(get_top3_from_solver, data)

        entry = {
            "captcha_id": captcha_id,
            "variants": variants,
            "images": {str(g["index"]): g["image"] for g in generated},
            "event": event,
            "result": None,
            "source_file": source_files.get(captcha_id),
            "usage_log_id": usage_log_id,
        }

        with lock:
            pending[captcha_id] = entry

        push_sse(
            {
                "type": "new_captcha",
                "captcha_id": captcha_id,
                "images": entry["images"],
                "count": len(entry["images"]),
                "top3": top3,
                "created_at": time.time(),
                "timeout": CAPTCHA_TIMEOUT,
            }
        )

        print(
            f"[{captcha_id}] Waiting for solution ({len(entry['images'])} variants). Top3: {top3}"
        )
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: event.wait(timeout=CAPTCHA_TIMEOUT)
        )

        if entry["result"] is None:
            print(f"[{captcha_id}] Timeout — no solution received")
            push_sse(
                {
                    "type": "captcha_timeout",
                    "captcha_id": captcha_id,
                }
            )

        result = entry["result"]
        with lock:
            pending.pop(captcha_id, None)
        if result:
            result["usage_log_id"] = entry["usage_log_id"]
        return JSONResponse(content=result)

    @app.post("/solve")
    async def handle_solve(body: SolveRequest):
        captcha_id = body.captcha_id
        variant_index = body.variantIndex

        with lock:
            entry = pending.get(captcha_id)

        result = None
        if entry:
            tile_ids = entry["variants"][variant_index]
            rid = next_result_id()
            result = {
                "variantIndex": variant_index,
                "variantTiles": tile_ids,
            }

            result["resultFile"] = f"captcha_{captcha_id}_{rid:04d}.json"
            entry["result"] = result
            entry["event"].set()
            print(f"[{captcha_id}] -> variantIndex={variant_index}")

            if write_mode and entry.get("source_file"):
                source_path = entry["source_file"]
                with open(source_path, "r") as f:
                    source_data = json.load(f)
                source_data["valid_index"] = variant_index
                new_path = os.path.join(VALID_DIR, f"{captcha_id}.json")
                if os.path.exists(new_path):
                    print(
                        f"  DUPLICATE: {os.path.basename(source_path)} already exists in valid/ as {captcha_id}.json"
                    )
                else:
                    with open(new_path, "w") as f:
                        json.dump(source_data, f, indent=2)
                    os.remove(source_path)
                    print(
                        f"  Saved: {os.path.basename(source_path)} -> valid/{captcha_id}.json (valid_index={variant_index})"
                    )

            push_sse(
                {
                    "type": "captcha_solved",
                    "captcha_id": captcha_id,
                }
            )

        if result is None:
            return JSONResponse(
                status_code=404,
                content={"error": f"Captcha {captcha_id} not found or already solved"},
            )
        return JSONResponse(content=result)

    @app.post("/trigger-test")
    async def trigger_test():
        t = threading.Thread(target=send_test_cases, daemon=True)
        t.start()
        return JSONResponse(content={"ok": True})

    @app.post("/broadcast")
    async def handle_broadcast(request: Request):
        data = await request.json()
        push_sse(data)
        return JSONResponse(content={"ok": True})

    @app.post("/api-keys")
    async def create_api_key(request: Request):
        body = await request.json()
        label = body.get("label", "")
        max_uses = body.get("max_uses")
        record = create_key(label, max_uses)
        return JSONResponse(content=record)

    @app.get("/api-keys")
    async def list_api_keys():
        keys = list_keys()
        masked = []
        for k in keys:
            key_val = k["key"]
            masked_key = key_val[:4] + "••••" + key_val[-4:]
            masked.append(
                {
                    "id": k["id"],
                    "key": key_val,
                    "masked_key": masked_key,
                    "label": k["label"],
                    "created_at": k["created_at"],
                    "usage_count": k["usage_count"],
                    "max_uses": k["max_uses"],
                    "active": k["active"],
                }
            )
        return JSONResponse(content=masked)

    @app.put("/api-keys/{key_id}")
    async def update_api_key(key_id: int, request: Request):
        body = await request.json()
        record = update_key(
            key_id,
            label=body.get("label"),
            max_uses=body.get("max_uses"),
            active=body.get("active"),
        )
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.delete("/api-keys/{key_id}")
    async def delete_api_key(key_id: int):
        if delete_key(key_id):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=404, content={"error": "Key not found"})

    @app.post("/api-keys/{key_id}/reset-usage")
    async def reset_api_key_usage(key_id: int):
        record = reset_usage(key_id)
        if not record:
            return JSONResponse(status_code=404, content={"error": "Key not found"})
        masked = {
            "id": record["id"],
            "label": record["label"],
            "created_at": record["created_at"],
            "usage_count": record["usage_count"],
            "max_uses": record["max_uses"],
            "active": record["active"],
        }
        return JSONResponse(content=masked)

    @app.get("/validate-key")
    async def validate_api_key(key: str):
        result = validate_key(key)
        return JSONResponse(content=result)

    @app.get("/api-key-status")
    async def api_key_status(key: str):
        result = validate_key(key)
        return JSONResponse(
            content={
                "valid": result["valid"],
                "remaining": result.get("remaining"),
                "label": result.get("label", ""),
            }
        )

    @app.post("/confirm-usage")
    async def handle_confirm_usage(request: Request):
        body = await request.json()
        usage_log_id = body["usage_log_id"]
        api_key = body["api_key"]
        key_record = get_key_record(api_key)
        if not key_record:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})
        log_entry = get_usage_log_entry(usage_log_id)
        if not log_entry or log_entry["api_key_id"] != key_record["id"]:
            return JSONResponse(
                status_code=404, content={"error": "Usage log entry not found"}
            )
        ok = confirm_usage(usage_log_id)
        if not ok:
            return JSONResponse(
                status_code=404, content={"error": "Usage log entry not found"}
            )
        return JSONResponse(content={"ok": True})

    @app.get("/usage-log")
    async def get_usage_log(api_key_id: int | None = None):
        records = list_usages(api_key_id)
        return JSONResponse(content=records)

    @app.post("/fail-usage")
    async def handle_fail_usage(request: Request):
        body = await request.json()
        usage_log_id = body["usage_log_id"]
        api_key = body["api_key"]
        error_message = body.get("error_message", "")
        error_stage = body.get("error_stage", "other")
        key_record = get_key_record(api_key)
        if not key_record:
            return JSONResponse(status_code=403, content={"error": "Invalid API key"})
        log_entry = get_usage_log_entry(usage_log_id)
        if not log_entry or log_entry["api_key_id"] != key_record["id"]:
            return JSONResponse(
                status_code=404, content={"error": "Usage log entry not found"}
            )
        ok = fail_usage(usage_log_id, error_message, error_stage)
        if not ok:
            return JSONResponse(
                status_code=404, content={"error": "Usage log entry not found"}
            )
        return JSONResponse(content={"ok": True})

    @app.post("/admin/auth")
    async def admin_auth(request: Request):
        body = await request.json()
        token = body.get("token", "")
        if token == ADMIN_TOKEN:
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    if os.path.isdir(FRONTEND_DIST):

        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str = ""):
            if not full_path:
                full_path = "index.html"
            file_path = os.path.join(FRONTEND_DIST, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
    else:

        @app.get("/{full_path:path}")
        async def serve_frontend_fallback(full_path: str = ""):
            index_path = os.path.join(FRONTEND_DIST, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return JSONResponse(
                status_code=503,
                content={"error": "Frontend not built. Run: make build-frontend"},
            )

    return app
