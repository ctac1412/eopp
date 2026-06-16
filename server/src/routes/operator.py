"""Operator routes — /operators/... cookie session endpoints + admin CRUD."""

import asyncio
import json as _json
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.repositories import api_key_repo, operator_repo, user_repo
from src.policies.access_policy import token_from_request
from src.sse.manager import operator_api_key_id, registry as realtime_registry
from src.modules.operator_distribution.service import distribute_active_operators

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
    subscribed = operator_repo.get_subscribed_operators(master_key_id)
    realtime_registry.set_master_operators(master_key_id, subscribed)
    old_order = list(_slot_order.get(master_key_id, []))

    # Determine which subscribed operators are currently online
    online_set: set[int] = set()
    for oid in subscribed:
        if realtime_registry.has_connection(operator_api_key_id(oid)):
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
    operator_user_id = op.get("user_id")
    if operator_user_id is None:
        return "Operator is not bound to a user"
    if master.user_id is None:
        return "Master key is not bound to a user"

    from src.repositories import user_company_access_repo

    operator_access = user_company_access_repo.user_access_payload("operator", int(operator_user_id))
    executor_access = user_company_access_repo.user_access_payload("executor", int(master.user_id))
    operator_company_ids = set(operator_access["company_ids"])
    executor_company_ids = set(executor_access["company_ids"])
    if operator_access["all_companies"] and executor_access["all_companies"]:
        return None
    if operator_access["all_companies"] and executor_company_ids:
        return None
    if executor_access["all_companies"] and operator_company_ids:
        return None
    if operator_company_ids & executor_company_ids:
        return None
    return "Operator company scope does not overlap executor key scope"


def _tenant_company_id(request: Request) -> int | None:
    user = user_repo.get_session_user(token_from_request(request))
    if not user or user.system_role:
        return None
    if user.company_id is not None:
        return user.company_id
    for membership in getattr(user, "company_memberships", []):
        if membership.active:
            return membership.company_id
    return None


def _operator_out_of_scope(operator_id: int, company_id: int | None) -> bool:
    return company_id is not None and not operator_repo.operator_allows_company(operator_id, company_id)


def _operator_session_guard(request: Request) -> JSONResponse | None:
    if not user_repo.get_session_user(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return None


@router.post("/operators/{uuid}/link")
async def operator_link(uuid: str, request: Request):
    op = operator_repo.get_operator_by_uuid(uuid)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    logger.info("operator_self_link_blocked op_id=%s uuid=%s", op["id"], uuid)
    return JSONResponse(
        status_code=403,
        content={"error": "Operator master assignment is managed by admin"},
    )


@router.post("/operators/{uuid}/unlink")
async def operator_unlink(uuid: str, request: Request):
    unauthorized = _operator_session_guard(request)
    if unauthorized:
        return unauthorized
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
    realtime_registry.unlink_operator(op["id"], master.id)
    logger.info("operator_unlink op_id=%s uuid=%s master_id=%s ok=%s", op["id"], uuid, master.id, ok)
    return JSONResponse(content={"ok": ok})


@router.get("/operators/{uuid}/stream")
async def operator_sse(uuid: str, request: Request):
    unauthorized = _operator_session_guard(request)
    if unauthorized:
        return unauthorized
    from src.sse.manager import (
        operator_api_key_id, register_sse_connection, unregister_sse_connection,
        replace_sse_connections,
    )

    op = operator_repo.get_operator_by_uuid(uuid)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})

    neg_id = operator_api_key_id(op["id"])
    client_ip = request.client.host if request.client else "unknown"
    q, displaced = register_sse_connection(neg_id, client_ip)

    if displaced:
        old_queues = replace_sse_connections(neg_id, q, client_ip)
        for old_q in old_queues:
            try:
                old_q.put_nowait(_json.dumps({"type": "disconnected", "message": "Новое подключение"}))
            except Exception:
                pass
        logger.info("operator_sse_replaced op_id=%s uuid=%s old_queues=%d", op["id"], uuid, len(old_queues))

    # Mark operator online
    operator_repo.set_operator_online(op["id"], True)
    realtime_registry.set_operator_display_mode(
        op["id"], op.get("icon_display_mode", "own_then_foreign")
    )
    realtime_registry.set_operator_masters(op["id"], operator_repo.get_operator_masters(op["id"]))

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
            push_sse as sse_push,
            operator_api_key_id as _op_key_id,
        )

        master_ids = realtime_registry.get_operator_masters(op["id"]) or operator_repo.get_operator_masters(op["id"])
        realtime_registry.set_operator_masters(op["id"], master_ids)
        online_masters = []
        fellow_ops: dict[int, dict] = {}  # {op_id: {id, nickname, master_id}}
        for mid in master_ids:
            if realtime_registry.has_connection(mid):
                online_masters.append(mid)
            subscribed = realtime_registry.get_master_operators(mid)
            if not subscribed:
                subscribed = operator_repo.get_subscribed_operators(mid)
                realtime_registry.set_master_operators(mid, subscribed)
            for fid in subscribed:
                if fid == op["id"]:
                    continue
                neg_id2 = _op_key_id(fid)
                if realtime_registry.has_connection(neg_id2):
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
async def operator_masters(uuid: str, request: Request):
    unauthorized = _operator_session_guard(request)
    if unauthorized:
        return unauthorized
    op = operator_repo.get_operator_by_uuid(uuid)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    allowed = op.get("allowed_master_keys")
    keys = api_key_repo.list_keys_for_operator(
        allowed_master_keys=allowed,
        company_ids=None if op.get("operator_all_companies") else op.get("operator_company_ids"),
    )
    assigned_master_ids = set(operator_repo.get_operator_masters(op["id"]))
    for key in keys:
        key["assigned"] = key.get("id") in assigned_master_ids
    return JSONResponse(content=keys)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.post("/admin/operators")
async def admin_create_operator(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    nickname = body.get("nickname", "operator")
    tenant_company_id = _tenant_company_id(request)
    company_id = tenant_company_id or body.get("company_id")
    op = operator_repo.create_operator(nickname, company_id=company_id)
    return JSONResponse(content=op)


@router.get("/admin/operators")
async def admin_list_operators(request: Request, include_test: bool = True):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=operator_repo.list_operators(_tenant_company_id(request), include_test_users=include_test))


@router.post("/admin/operator-assignments/bulk")
async def admin_bulk_operator_assignments(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    assignments = body.get("assignments")
    if not isinstance(assignments, list):
        return JSONResponse(status_code=400, content={"error": "assignments must be a list"})

    tenant_company_id = _tenant_company_id(request)
    normalized = []
    for assignment in assignments:
        if not isinstance(assignment, dict) or not assignment.get("operator_id"):
            return JSONResponse(status_code=400, content={"error": "operator_id required"})
        operator_id = int(assignment["operator_id"])
        if _operator_out_of_scope(operator_id, tenant_company_id):
            return JSONResponse(status_code=403, content={"error": "Operator out of company scope"})
        item = dict(assignment)
        if tenant_company_id is not None:
            item["company_ids"] = [tenant_company_id]
        normalized.append(item)

    try:
        rows = operator_repo.save_operator_assignments(normalized)
    except PermissionError as exc:
        return JSONResponse(status_code=403, content={"error": str(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    for row in rows:
        realtime_registry.set_operator_masters(row["id"], operator_repo.get_operator_masters(row["id"]))
    return JSONResponse(content={"operators": rows})


@router.put("/admin/operators/{operator_id}")
async def admin_update_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    tenant_company_id = _tenant_company_id(request)
    if _operator_out_of_scope(operator_id, tenant_company_id):
        return JSONResponse(status_code=403, content={"error": "Operator out of company scope"})

    kwargs = {}
    if "icon_display_mode" in body:
        kwargs["icon_display_mode"] = body["icon_display_mode"]
    if "icon_rate" in body:
        kwargs["icon_rate"] = max(0, int(body.get("icon_rate") or 0))
    if "billing_mode" in body:
        billing_mode = str(body.get("billing_mode") or "company")
        if billing_mode not in {"company", "custom", "free"}:
            return JSONResponse(status_code=400, content={"error": "Invalid operator billing_mode"})
        kwargs["billing_mode"] = billing_mode
    if "allowed_master_keys" in body:
        val = body["allowed_master_keys"]
        kwargs["allowed_master_keys"] = _json.dumps(val) if val is not None else None
    if "company_id" in body:
        kwargs["company_id"] = tenant_company_id or body["company_id"]
    if "company_ids" in body:
        company_ids = body["company_ids"]
        if tenant_company_id is not None:
            company_ids = [tenant_company_id]
        kwargs["company_ids"] = company_ids
    if "billing_overrides" in body:
        overrides = body["billing_overrides"] or []
        if tenant_company_id is not None:
            overrides = [
                {
                    **override,
                    "company_id": tenant_company_id,
                }
                for override in overrides
                if int(override.get("company_id") or 0) == int(tenant_company_id)
            ]
        kwargs["billing_overrides"] = overrides

    try:
        op = operator_repo.update_operator(operator_id, **kwargs)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    if "icon_display_mode" in kwargs:
        realtime_registry.set_operator_display_mode(
            operator_id,
            op.get("icon_display_mode", "own_then_foreign"),
        )
    logger.info("admin_update_operator op_id=%s kwargs=%s", operator_id, kwargs)
    return JSONResponse(content=op)


@router.put("/admin/operators/{operator_id}/link")
async def admin_relink_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    from src.sse.manager import operator_api_key_id, push_sse

    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    raw = await request.body()
    body = _json.loads(raw) if raw else {}
    master_key_id = body.get("master_key_id")
    if not master_key_id:
        return JSONResponse(status_code=400, content={"error": "master_key_id required"})

    op = operator_repo.get_operator_by_id(operator_id)
    if not op:
        return JSONResponse(status_code=404, content={"error": "Operator not found"})
    tenant_company_id = _tenant_company_id(request)
    if _operator_out_of_scope(operator_id, tenant_company_id):
        return JSONResponse(status_code=403, content={"error": "Operator out of company scope"})

    err = _check_link_allowed(op, master_key_id)
    if err:
        logger.warning(
            "admin_relink_blocked op_id=%s master_key_id=%s reason=%s",
            operator_id, master_key_id, err,
        )
        return JSONResponse(status_code=403, content={"error": err})

    link_id, _ = operator_repo.link_operator_to_master(operator_id, master_key_id)
    realtime_registry.set_operator_masters(operator_id, operator_repo.get_operator_masters(operator_id))

    try:
        await _rebuild_slot_order(master_key_id)
        await _push_slot_update(master_key_id)
    except Exception as exc:
        logger.error("admin_relink_slot_rebuild_error op_id=%s master_id=%s %s", operator_id, master_key_id, exc)

    master = api_key_repo.get_key_by_id(master_key_id)

    # Push SSE to operator
    push_sse(
        {
            "type": "master_reassigned",
            "master_key_id": master_key_id,
            "master_label": getattr(master, "label", None) if master else None,
            "master_online": realtime_registry.has_connection(master_key_id),
        },
        api_key_id=operator_api_key_id(operator_id),
    )

    logger.info("admin_relink_operator op_id=%s master_key_id=%s link_id=%s",
                operator_id, master_key_id, link_id)
    return JSONResponse(content={"ok": True, "link_id": link_id})


@router.delete("/admin/operators/{operator_id}")
async def admin_delete_operator(operator_id: int, request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    if _operator_out_of_scope(operator_id, _tenant_company_id(request)):
        return JSONResponse(status_code=403, content={"error": "Operator out of company scope"})
    ok = operator_repo.delete_operator(operator_id)
    return JSONResponse(content={"ok": ok})


@router.get("/admin/operator-links")
async def admin_active_links(request: Request, include_test: bool = True):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return JSONResponse(content=operator_repo.get_active_links(_tenant_company_id(request), include_test_users=include_test))


@router.post("/admin/operator-distribution/active/round-robin")
async def admin_distribute_active_operators(request: Request):
    from src.policies.access_policy import is_admin_token
    from src.sse.manager import push_sse

    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    result = distribute_active_operators(company_id=_tenant_company_id(request))
    if result["applied_count"] == 0:
        return JSONResponse(
            status_code=400,
            content={
                **result,
                "error": "Нет активных операторов или доступных online-мастеров",
            },
        )

    affected_masters = {int(item["master_key_id"]) for item in result["assignments"]}
    for assignment in result["assignments"]:
        operator_id = int(assignment["operator_id"])
        master_key_id = int(assignment["master_key_id"])
        realtime_registry.set_operator_masters(operator_id, operator_repo.get_operator_masters(operator_id))
        master = api_key_repo.get_key_by_id(master_key_id)
        push_sse(
            {
                "type": "master_reassigned",
                "master_key_id": master_key_id,
                "master_label": getattr(master, "label", None) if master else None,
                "master_online": realtime_registry.has_connection(master_key_id),
            },
            api_key_id=operator_api_key_id(operator_id),
        )

    for master_key_id in affected_masters:
        try:
            await _rebuild_slot_order(master_key_id)
            await _push_slot_update(master_key_id)
        except Exception as exc:
            logger.error("admin_distribute_active_slot_rebuild_error master_id=%s %s", master_key_id, exc)

    logger.info(
        "admin_distribute_active_operators strategy=%s applied=%s skipped=%s",
        result["strategy"],
        result["applied_count"],
        len(result["skipped"]),
    )
    return JSONResponse(content=result)


@router.get("/admin/distribution-answers")
async def admin_distribution_answers(request: Request):
    from src.policies.access_policy import is_admin_token
    if not is_admin_token(token_from_request(request)):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    from src.repositories import distribution_repo
    page = int(request.query_params.get("page", 1))
    per_page = int(request.query_params.get("per_page", 50))
    return JSONResponse(content=distribution_repo.get_distribution_answers(page, per_page))
