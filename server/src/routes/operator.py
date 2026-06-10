"""Operator routes — /operators/... (no auth) + admin CRUD."""

import asyncio
import json as _json
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo, operator_repo

logger = logging.getLogger("eopp.operator")

router = APIRouter(tags=["operators"])


@router.post("/operators/{uuid}/link")
async def operator_link(uuid: str, request: Request):
    from src.sse.manager import operator_api_key_id, push_sse

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
    link_id, _ = operator_repo.link_operator_to_master(op["id"], master.id)
    logger.info("operator_link op_id=%s uuid=%s master_id=%s", op["id"], uuid, master.id)
    return JSONResponse(content={"ok": True, "operator_id": op["id"]})


@router.post("/operators/{uuid}/unlink")
async def operator_unlink(uuid: str, request: Request):
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
    ok = operator_repo.unlink_operator(op["id"], master.id)
    logger.info("operator_unlink op_id=%s uuid=%s master_id=%s ok=%s", op["id"], uuid, master.id, ok)
    return JSONResponse(content={"ok": ok})


@router.get("/operators/{uuid}/stream")
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
        master_ids = operator_repo.get_operator_masters(op["id"])
        from src.sse.manager import push_sse as sse_push, sse_queues as _sse_queues, lock as _sse_lock, operator_api_key_id as _op_key_id

        online_masters = []
        fellow_ops: dict[int, dict] = {}  # {op_id: {id, nickname, master_id}}
        with _sse_lock:
            for mid in master_ids:
                if _sse_queues.get(mid):
                    online_masters.append(mid)
                for fid in operator_repo.get_subscribed_operators(mid):
                    if fid == op["id"]:
                        continue
                    neg_id = _op_key_id(fid)
                    if _sse_queues.get(neg_id):
                        fop = operator_repo.get_operator_by_id(fid)
                        if fop:
                            fellow_ops[fid] = {"id": fid, "nickname": fop.get("nickname", ""), "master_id": mid}

        yield "data: %s\n\n" % _json.dumps({
            "type": "connected",
            "operator_id": op["id"],
            "uuid": uuid,
            "masters_online": online_masters,
            "fellow_operators": list(fellow_ops.values()),
        })

        for mid in master_ids:
            sse_push({
                "type": "operator_connected",
                "operator_id": op["id"],
                "operator_nickname": op["nickname"],
            }, api_key_id=mid)
        logger.info("operator_sse_online op_id=%s uuid=%s masters=%s online=%s", op["id"], uuid, master_ids, online_masters)

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
            try:
                unregister_sse_connection(q, neg_id)
            except Exception as exc:
                logger.error("operator_sse_cleanup_error op_id=%s %s", op["id"], exc)
            try:
                for mid in master_ids:
                    sse_push({
                        "type": "operator_disconnected",
                        "operator_id": op["id"],
                        "operator_nickname": op["nickname"],
                    }, api_key_id=mid)
            except Exception as exc:
                logger.error("operator_sse_disconnect_push_error op_id=%s %s", op["id"], exc)
            logger.info("operator_sse_offline op_id=%s uuid=%s masters=%s", op["id"], uuid, master_ids)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/operators/{uuid}/masters")
async def operator_masters(uuid: str):
    op = operator_repo.get_operator_by_uuid(uuid)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    keys = api_key_repo.list_keys()
    return JSONResponse(content=[
        {"id": k["id"], "label": k["label"], "active": k["active"]}
        for k in keys if k["active"]
    ])


@router.post("/admin/operators")
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


@router.get("/admin/operators")
async def admin_list_operators(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=operator_repo.list_operators())


@router.delete("/admin/operators/{operator_id}")
async def admin_delete_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    ok = operator_repo.delete_operator(operator_id)
    return JSONResponse(content={"ok": ok})


@router.get("/admin/operator-links")
async def admin_active_links(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=operator_repo.get_active_links())


@router.get("/admin/distribution-answers")
async def admin_distribution_answers(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.repositories import distribution_repo
    page = int(request.query_params.get("page", 1))
    per_page = int(request.query_params.get("per_page", 50))
    return JSONResponse(content=distribution_repo.get_distribution_answers(page, per_page))
