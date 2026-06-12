"""Regression tests for Phase 4 nonblocking realtime fanout."""

from src.core.realtime.fanout import RealtimeFanout
from src.core.realtime.registry import RealtimeRegistry, operator_api_key_id


def test_slow_filled_operator_queue_does_not_block_other_operators():
    registry = RealtimeRegistry(queue_maxsize=1)
    fanout = RealtimeFanout(registry)

    slow = registry.register_connection(api_key_id=-101, ip="slow").queue
    fast = registry.register_connection(api_key_id=-102, ip="fast").queue
    owner = registry.register_connection(api_key_id=42, ip="owner").queue

    slow.put_nowait("already full")

    result = fanout.push({"type": "new_captcha", "captcha_id": "cap-1"}, api_key_id=None)

    assert result.delivered == 2
    assert result.dropped == 1
    assert result.lagging == 1
    assert slow.get_nowait() == "already full"
    assert "cap-1" in fast.get_nowait()
    assert "cap-1" in owner.get_nowait()
    assert registry.snapshot(api_key_id=-101)[0].lagging is True


def test_targeted_owner_fanout_uses_operator_snapshot_without_db_lookup():
    registry = RealtimeRegistry(queue_maxsize=2)
    fanout = RealtimeFanout(registry)

    owner = registry.register_connection(api_key_id=42, ip="owner").queue
    operator = registry.register_connection(api_key_id=operator_api_key_id(5), ip="operator").queue
    other = registry.register_connection(api_key_id=operator_api_key_id(6), ip="other").queue

    registry.set_master_operators(42, [5])

    result = fanout.push_to_owner_and_operators(
        {"type": "captcha_timeout", "captcha_id": "cap-2"},
        owner_api_key_id=42,
    )

    assert result.delivered == 2
    assert "cap-2" in owner.get_nowait()
    assert "cap-2" in operator.get_nowait()
    assert other.empty()


def test_push_sse_facade_keeps_filled_queue_registered():
    from src.sse import manager

    manager.registry.reset()
    manager._sync_legacy_state()
    try:
        slow, _ = manager.register_sse_connection(api_key_id=-101, ip="slow")
        fast, _ = manager.register_sse_connection(api_key_id=-102, ip="fast")

        for i in range(manager.registry.queue_maxsize):
            slow.put_nowait(f"filled-{i}")

        result = manager.push_sse({"type": "new_captcha", "captcha_id": "cap-3"})

        assert result.delivered == 1
        assert result.dropped == 1
        assert manager.registry.has_connection(-101) is True
        assert "cap-3" in fast.get_nowait()
    finally:
        manager.registry.reset()
        manager._sync_legacy_state()
