"""Operator routes — /operators/... (no auth) + admin CRUD."""

import asyncio
import json as _json
import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo, operator_repo

logger = logging.getLogger("eopp.operator")


def register_operator_routes(app):
    @app.post("/operators/{uuid}/link")
    async def operator_link(uuid: str, request: Request):
        op = operator_repo.get_operator_by_uuid(uuid)
        if not op:
            return JSONResponse(status_code=404, content={"error": "Operator not found"})
        raw = await request.body()
        body = _json.loads(raw) if raw else {}
        master_id = body.get("master_id")
        if master_id:
            master = api_key_repo.get_key_by_id(master_id)
        else:
            master_key = body.get("master_key", "")
            master = api_key_repo.get_key_record(master_key)
        if not master:
            return JSONResponse(status_code=403, content={"error": "Invalid master key"})
        operator_repo.link_operator_to_master(op["id"], master.id)
        logger.info("operator_link op_id=%s uuid=%s master_id=%s", op["id"], uuid, master.id)
        return JSONResponse(content={"ok": True, "operator_id": op["id"]})

    @app.get("/operators/{uuid}/stream")
    async def operator_sse(uuid: str, request: Request):
        from src.sse.manager import operator_api_key_id, register_sse_connection, unregister_sse_connection, lock as sse_lock, sse_queues, sse_connections

        op = operator_repo.get_operator_by_uuid(uuid)
        if not op:
            return JSONResponse(status_code=404, content={"error": "Operator not found"})

        neg_id = operator_api_key_id(op["id"])
        client_ip = request.client.host if request.client else "unknown"
        q, displaced = register_sse_connection(neg_id, client_ip)

        if displaced:
            with sse_lock:
                old_queues = sse_queues.get(neg_id, [])[:]
                sse_queues[neg_id] = [q]
                sse_connections[:] = [c for c in sse_connections if c.get("api_key_id") != neg_id]
                sse_connections.append({
                    "queue": q, "api_key_id": neg_id, "real_api_key_id": None,
                    "ip": client_ip, "connected_at": time.time(),
                })
            for old_q in old_queues:
                try:
                    old_q.put_nowait(_json.dumps({"type": "disconnected", "message": "Новое подключение"}))
                except Exception:
                    pass
            logger.info("operator_sse_replaced op_id=%s uuid=%s old_queues=%d", op["id"], uuid, len(old_queues))

        async def event_stream():
            yield "data: {\"type\": \"connected\", \"operator_id\": %d, \"uuid\": \"%s\"}\n\n" % (op["id"], uuid)
            try:
                while True:
                    try:
                        data = await asyncio.wait_for(q.get(), timeout=15.0)
                        yield data
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
            except Exception:
                pass
            finally:
                unregister_sse_connection(q, neg_id)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/operators/{uuid}/masters")
    async def operator_masters(uuid: str):
        op = operator_repo.get_operator_by_uuid(uuid)
        if not op:
            return JSONResponse(status_code=404, content={"error": "Operator not found"})
        keys = api_key_repo.list_keys()
        return JSONResponse(content=[
            {"id": k["id"], "label": k["label"], "active": k["active"]}
            for k in keys if k["active"]
        ])

    # Admin CRUD
    @app.post("/admin/operators")
    async def admin_create_operator(request: Request):
        from src.policies.access_policy import is_admin_token
        if not is_admin_token(request.headers.get("X-Admin-Token")):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        import json as _json
        raw = await request.body()
        body = _json.loads(raw) if raw else {}
        nickname = body.get("nickname", "operator")
        op = operator_repo.create_operator(nickname)
        return JSONResponse(content=op)

    @app.get("/admin/operators")
    async def admin_list_operators(request: Request):
        from src.policies.access_policy import is_admin_token
        if not is_admin_token(request.headers.get("X-Admin-Token")):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        return JSONResponse(content=operator_repo.list_operators())

    @app.delete("/admin/operators/{operator_id}")
    async def admin_delete_operator(operator_id: int, request: Request):
        from src.policies.access_policy import is_admin_token
        if not is_admin_token(request.headers.get("X-Admin-Token")):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})
        ok = operator_repo.delete_operator(operator_id)
        return JSONResponse(content={"ok": ok})
