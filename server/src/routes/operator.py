"""Operator routes — /operators/... (no auth) + admin CRUD."""

import asyncio
import json as _json
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo, operator_repo
from src.sse.manager import operator_api_key_id

logger = logging.getLogger("eopp.operator")

router = APIRouter(tags=["operators"])

# Connection-order slot tracking: master_key_id → [op_id, ...] in connect order
_slot_order: dict[int, list[int]] = {}
_slot_lock = asyncio.Lock()


def get_operator_slot_order(master_key_id: int) -> list[int]:
    """Return operator IDs in connection order for distribution slot assignment."""
    return list(_slot_order.get(master_key_id, []))


async def _rebuild_slot_order(master_key_id: int) -> list[int]:
    """Rebuild slot order from currently online operators of a master.
    Preserves existing order, removes offline, adds new online operators at the end.
    Returns the new order.
    """
    from src.sse.manager import sse_queues as _sse_queues, operator_api_key_id as _op_key_id, lock as _sse_lock

    subscribed = operator_repo.get_subscribed_operators(master_key_id)
    old_order = list(_slot_order.get(master_key_id, []))

    # Determine which subscribed operators are currently online
    online_set: set[int] = set()
    with _sse_lock:
        for oid in subscribed:
            if _sse_queues.get(_op_key_id(oid)):
                online_set.add(oid)

    # Keep old order for operators still online, append new ones
    new_order = [oid for oid in old_order if oid in online_set]
    for oid in subscribed:
        if oid in online_set and oid not in new_order:
            new_order.append(oid)

    _slot_order[master_key_id] = new_order
    return new_order


async def _push_slot_update(master_key_id: int):
    """Push operator_slots event to the master."""
    from src.sse import push_sse
    from src.constants import DISTRIBUTION

    order = _slot_order.get(master_key_id, [])
    num_participants = 1 + len(order)
    dist = DISTRIBUTION.get(num_participants, {})

    slots = []
    for idx, op_id in enumerate(order):
        op_info = operator_repo.get_operator_by_id(op_id)
        slot_key = str(idx + 1)  # 1-based slot key for DISTRIBUTION
        assigned = dist.get(slot_key, [])
        slots.append({
            "operator_id": op_id,
            "nickname": op_info.get("nickname", f"#{op_id}") if op_info else f"#{op_id}",
            "slot_index": idx + 1,
            "color_index": idx,
            "assigned_icons": assigned,
        })

    push_sse({
        "type": "operator_slots",
        "master_key_id": master_key_id,
        "slots": slots,
    }, api_key_id=master_key_id)

    # Also push to all operators of this master
    for op_id in order:
        push_sse({
            "type": "operator_slots",
            "master_key_id": master_key_id,
            "slots": slots,
        }, api_key_id=operator_api_key_id(op_id))


def _check_link_allowed(op: dict, master_key_id: int) -> str | None:
    """Return error message if linking to this master is not allowed, or None."""
    master = api_key_repo.get_key_by_id(master_key_id)
    if not master:
        return "Invalid master key"
    allowed = op.get("allowed_master_keys")
    if allowed is not None and master_key_id not in allowed:
        return "Master key not in operator's allowed_master_keys"
    return None


@router.post("/operators/{uuid}/link")
async def operator_link(uuid: str, request: Request):
    from src.sse.manager import push_sse

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

    err = _check_link_allowed(op, master.id)
    if err:
        logger.warning(
            "operator_link_blocked op_id=%s uuid=%s master_id=%s reason=%s",
            op["id"], uuid, master.id, err,
        )
        return JSONResponse(status_code=403, content={"error": err})

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
    from src.sse.manager import (
        operator_api_key_id, register_sse_connection, unregister_sse_connection,
        lock as sse_lock, sse_queues, sse_connections,
    )

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

    # Mark operator online
    operator_repo.set_operator_online(op["id"], True)

    # Rebuild slot order for each master and push updates
    for mid in operator_repo.get_operator_masters(op["id"]):
        try:
            await _rebuild_slot_order(mid)
            await _push_slot_update(mid)
        except Exception as exc:
            logger.error("operator_slot_rebuild_error op_id=%s mid=%s %s", op["id"], mid, exc)

    # Send system chat message about operator joining (only if first connect)
    was_already_online = displaced
    if not was_already_online:
        try:
            from src.constants import DISTRIBUTION
            from src.sse import push_sse as _psse
            for mid in operator_repo.get_operator_masters(op["id"]):
                order = _slot_order.get(mid, [])
                num_participants = 1 + len(order)
                dist = DISTRIBUTION.get(num_participants, {})
                try:
                    slot_idx = order.index(op["id"])
                    slot_key = str(slot_idx + 1)
                    assigned = dist.get(slot_key, [])
                    icons_str = ",".join(str(i) for i in assigned) if assigned else "нет"
                except ValueError:
                    icons_str = "??"
                chat_event = {
                    "type": "chat_message",
                    "sender_role": "system",
                    "sender_id": 0,
                    "sender_label": "Система",
                    "message": f"Подключился {op['nickname']}. Иконки: [{icons_str}]",
                    "timestamp": time.time(),
                }
                _psse(chat_event, api_key_id=mid)
                for oid in order:
                    _psse(chat_event, api_key_id=operator_api_key_id(oid))
        except Exception as exc:
            logger.error("operator_chat_join_msg_error op_id=%s %s", op["id"], exc)

    async def event_stream():
        from src.sse.manager import (
            lock as _sse_lock, push_sse as sse_push, sse_queues as _sse_queues,
            operator_api_key_id as _op_key_id,
        )

        master_ids = operator_repo.get_operator_masters(op["id"])
        online_masters = []
        fellow_ops: dict[int, dict] = {}  # {op_id: {id, nickname, master_id}}
        with _sse_lock:
            for mid in master_ids:
                if _sse_queues.get(mid):
                    online_masters.append(mid)
                for fid in operator_repo.get_subscribed_operators(mid):
                    if fid == op["id"]:
                        continue
                    neg_id2 = _op_key_id(fid)
                    if _sse_queues.get(neg_id2):
                        fop = operator_repo.get_operator_by_id(fid)
                        if fop:
                            fellow_ops[fid] = {
                                "id": fid,
                                "nickname": fop.get("nickname", ""),
                                "master_id": mid,
                            }

        # Build scheduled events for connected handshake
        from src.routes.scheduled import get_scheduled_events_for_masters
        scheduled_events = get_scheduled_events_for_masters(master_ids)

        # Aggregate chat history from all masters
        from src.routes.chat import get_chat_history
        chat_history: list[dict] = []
        for mid in master_ids:
            chat_history.extend(get_chat_history(mid))

        yield "data: %s\n\n" % _json.dumps({
            "type": "connected",
            "operator_id": op["id"],
            "uuid": uuid,
            "nickname": op["nickname"],
            "masters_online": online_masters,
            "fellow_operators": list(fellow_ops.values()),
            "scheduled_events": scheduled_events,
            "chat_history": chat_history,
        })

        for mid in master_ids:
            sse_push({
                "type": "operator_connected",
                "operator_id": op["id"],
                "operator_nickname": op["nickname"],
            }, api_key_id=mid)
        logger.info("operator_sse_online op_id=%s uuid=%s masters=%s online=%s",
                     op["id"], uuid, master_ids, online_masters)

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
            # Mark operator offline
            try:
                operator_repo.set_operator_online(op["id"], False)
            except Exception as exc:
                logger.error("operator_sse_set_offline_error op_id=%s %s", op["id"], exc)
            # Rebuild slot order for each master after disconnect
            for mid in master_ids:
                try:
                    await _rebuild_slot_order(mid)
                    await _push_slot_update(mid)
                except Exception as exc:
                    logger.error("operator_slot_disconnect_rebuild_error op_id=%s mid=%s %s", op["id"], mid, exc)
            logger.info("operator_sse_offline op_id=%s uuid=%s masters=%s",
                         op["id"], uuid, master_ids)

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
    allowed = op.get("allowed_master_keys")
    keys = api_key_repo.list_keys_for_operator(allowed_master_keys=allowed)
    return JSONResponse(content=keys)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.post("/admin/operators")
async def admin_create_operator(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    nickname = body.get("nickname", "operator")
    company_id = body.get("company_id")
    op = operator_repo.create_operator(nickname, company_id=company_id)
    return JSONResponse(content=op)


@router.get("/admin/operators")
async def admin_list_operators(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=operator_repo.list_operators())


@router.put("/admin/operators/{operator_id}")
async def admin_update_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}

    kwargs = {}
    if "nickname" in body:
        kwargs["nickname"] = body["nickname"]
    if "icon_display_mode" in body:
        kwargs["icon_display_mode"] = body["icon_display_mode"]
    if "allowed_master_keys" in body:
        val = body["allowed_master_keys"]
        kwargs["allowed_master_keys"] = _json.dumps(val) if val is not None else None
    if "company_id" in body:
        kwargs["company_id"] = body["company_id"]

    op = operator_repo.update_operator(operator_id, **kwargs)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    logger.info("admin_update_operator op_id=%s kwargs=%s", operator_id, kwargs)
    return JSONResponse(content=op)


@router.put("/admin/operators/{operator_id}/link")
async def admin_relink_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    from src.sse.manager import operator_api_key_id, push_sse

    if not is_admin_token(request.headers.get("X-Admin-Token")):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    master_key_id = body.get("master_key_id")
    if not master_key_id:
        return JSONResponse(status_code=400, content={"error": "master_key_id required"})

    op = operator_repo.get_operator_by_id(operator_id)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})

    err = _check_link_allowed(op, master_key_id)
    if err:
        logger.warning(
            "admin_relink_blocked op_id=%s master_key_id=%s reason=%s",
            operator_id, master_key_id, err,
        )
        return JSONResponse(status_code=403, content={"error": err})

    link_id, _ = operator_repo.link_operator_to_master(operator_id, master_key_id)

    # Push SSE to operator
    push_sse(
        {"type": "master_reassigned", "master_key_id": master_key_id},
        api_key_id=operator_api_key_id(operator_id),
    )

    logger.info("admin_relink_operator op_id=%s master_key_id=%s link_id=%s",
                operator_id, master_key_id, link_id)
    return JSONResponse(content={"ok": True, "link_id": link_id})


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
