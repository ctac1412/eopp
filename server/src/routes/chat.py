"""Chat routes — in-memory chat message delivery between master and operators."""

import logging
import time
from collections import defaultdict

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.models import ChatMessageBody
from src.repositories import operator_repo
from src.sse import push_sse
from src.sse.manager import operator_api_key_id

logger = logging.getLogger("eopp.chat")

router = APIRouter(tags=["chat"])

# In-memory history: master_key_id → list of last 20 messages
_chat_history: dict[int, list[dict]] = defaultdict(list)
_MAX_HISTORY = 20


def get_chat_history(master_key_id: int) -> list[dict]:
    """Return recent chat messages for a master (for SSE handshake)."""
    return _chat_history.get(master_key_id, [])[-_MAX_HISTORY:]


@router.post("/chat/send")
async def send_chat_message(body: ChatMessageBody):
    """Deliver a chat message to master and all online operators of that master."""
    timestamp = time.time()

    event = {
        "type": "chat_message",
        "sender_role": body.sender_role,
        "sender_id": body.sender_id,
        "sender_label": body.sender_label,
        "message": body.message,
        "timestamp": timestamp,
    }

    # Store in history
    hist = _chat_history[body.master_key_id]
    hist.append(event)
    if len(hist) > _MAX_HISTORY:
        _chat_history[body.master_key_id] = hist[-_MAX_HISTORY:]

    # Push to master
    push_sse(event, api_key_id=body.master_key_id)

    # Push to all online operators of this master
    op_ids = operator_repo.get_subscribed_operators(body.master_key_id)
    for op_id in op_ids:
        push_sse(event, api_key_id=operator_api_key_id(op_id))

    logger.info(
        "chat_message sender=%s/%s master_key=%s ops=%d msg_len=%d",
        body.sender_role, body.sender_id, body.master_key_id, len(op_ids),
        len(body.message),
    )

    # Readiness check: when master sends "Все готовы?", push countdown to operators
    if body.sender_role == "master" and body.message.strip().lower().startswith("все готовы"):
        rd_event = {
            "type": "readiness_check",
            "master_key_id": body.master_key_id,
            "countdown": 20,
            "message": body.message,
        }
        for op_id in op_ids:
            push_sse(rd_event, api_key_id=operator_api_key_id(op_id))
        logger.info(
            "readiness_check_dispatched master_key=%s ops=%d",
            body.master_key_id, len(op_ids),
        )

    return JSONResponse(content={"ok": True, "delivered_to_operators": len(op_ids)})
