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
    TEST_DIR,
    VALID_DIR,
    NO_VALID_DIR,
    CAPTCHA_TIMEOUT,
    write_mode,
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

FRONTEND_DIST = os.path.join(PROJECT_DIR, "frontend", "dist")


class SolveRequest(BaseModel):
    captcha_id: str
    variantIndex: int


def create_app(use_tests: bool = False) -> FastAPI:
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

    app = FastAPI(lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

        return JSONResponse(content=result)

    @app.get("/injector-script")
    async def injector_script():
        script_path = os.path.join(PROJECT_DIR, "injector", "injector.js")
        if os.path.exists(script_path):
            with open(script_path, "r", encoding="utf-8") as f:
                return JSONResponse(content={"script": f.read()})
        return JSONResponse(status_code=404, content={"error": "injector.js not found"})

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
                base, _ = os.path.splitext(source_path)
                num = os.path.basename(base).replace("test_", "")
                new_path = os.path.join(TEST_DIR, f"test_answ_{int(num):02d}.json")
                with open(new_path, "w") as f:
                    json.dump(source_data, f, indent=2)
                os.remove(source_path)
                print(
                    f"  Saved: {os.path.basename(source_path)} -> {os.path.basename(new_path)} (valid_index={variant_index})"
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
