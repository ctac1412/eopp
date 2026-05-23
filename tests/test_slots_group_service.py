"""Tests for slots_group_service — in-memory slots group coordination."""

import time

from src.services import slots_group_service


def test_claim_first_is_master():
    """First claim for a new group_key creates a master."""
    slots_group_service.clear()
    result = slots_group_service.claim("group-1", "client-a")
    assert result["role"] == "master"
    assert result["status"] == "claimed"
    assert result["group_key"] == "group-1"


def test_claim_second_is_slave():
    """Second claim for the same group returns slave with pending status."""
    slots_group_service.clear()
    slots_group_service.claim("group-2", "master-1")
    result = slots_group_service.claim("group-2", "slave-1")
    assert result["role"] == "slave"
    assert result["status"] == "pending"


def test_claim_existing_master():
    """Same client claiming again as master returns existing group."""
    slots_group_service.clear()
    slots_group_service.claim("group-3", "client-a")
    result = slots_group_service.claim("group-3", "client-a")
    assert result["role"] == "master"
    assert result["status"] == "claimed"


def test_publish_by_master():
    """Master can publish slots_response."""
    slots_group_service.clear()
    slots_group_service.claim("group-4", "master-1")
    result = slots_group_service.publish(
        "group-4", "master-1", {"slots": [{"id": 1, "date": "2026-01-01"}]}
    )
    assert result["ok"] is True
    assert result["status"] == "ready"


def test_publish_by_non_master_fails():
    """Non-master cannot publish."""
    slots_group_service.clear()
    slots_group_service.claim("group-5", "master-1")
    result = slots_group_service.publish("group-5", "impostor", {"slots": []})
    assert result["ok"] is False
    assert result["error"] == "not_master"


def test_slave_gets_ready_after_publish():
    """Slave gets 'ready' status after master publishes."""
    slots_group_service.clear()
    slots_group_service.claim("group-6", "master-1")
    slots_group_service.claim("group-6", "slave-1")
    slots_group_service.publish("group-6", "master-1", {"slots": [{"id": 1}]})
    result = slots_group_service.get("group-6", "slave-1")
    assert result["status"] == "ready"


def test_fail_by_master():
    """Master can mark a group as failed."""
    slots_group_service.clear()
    slots_group_service.claim("group-7", "master-1")
    result = slots_group_service.fail("group-7", "master-1", "no_slots")
    assert result["ok"] is True
    assert result["status"] == "failed"
    assert result["error"] == "no_slots"


def test_fail_by_non_master_fails():
    """Non-master cannot fail a group."""
    slots_group_service.clear()
    slots_group_service.claim("group-8", "master-1")
    result = slots_group_service.fail("group-8", "impostor", "no_slots")
    assert result["ok"] is False
    assert result["error"] == "not_master"


def test_get_expired_group():
    """Getting a non-existent group returns expired."""
    slots_group_service.clear()
    result = slots_group_service.get("nonexistent", "client-1")
    assert result["status"] == "expired"


def test_heartbeat():
    """Master heartbeat extends last_heartbeat_at."""
    slots_group_service.clear()
    slots_group_service.claim("group-9", "master-1")
    result = slots_group_service.heartbeat("group-9", "master-1")
    assert result["ok"] is True
    assert "remaining" in result
    assert "waiters" in result


def test_heartbeat_non_master_fails():
    """Non-master heartbeat is rejected."""
    slots_group_service.clear()
    slots_group_service.claim("group-10", "master-1")
    result = slots_group_service.heartbeat("group-10", "impostor")
    assert result["ok"] is False


def test_heartbeat_expired_group():
    """Heartbeat on non-existent group fails."""
    slots_group_service.clear()
    result = slots_group_service.heartbeat("no-group", "client-1")
    assert result["ok"] is False
    assert result["error"] == "group_expired"


def test_stats():
    """Stats returns correct counts."""
    slots_group_service.clear()
    slots_group_service.claim("s-group-1", "m-1")
    slots_group_service.claim("s-group-2", "m-2")
    slots_group_service.publish("s-group-2", "m-2", {"slots": [1]})
    st = slots_group_service.stats()
    assert st["groups"] == 2
    assert st["ready"] == 1
    assert st["pending"] == 1


def test_clear():
    """Clear removes all groups and events."""
    slots_group_service.clear()
    slots_group_service.claim("c-group", "m-1")
    slots_group_service.clear()
    st = slots_group_service.stats()
    assert st["groups"] == 0


def test_get_events_since():
    """get_events_since returns events after given index."""
    slots_group_service.clear()
    slots_group_service.claim("ev-group", "m-1")
    events, current = slots_group_service.get_events_since(0)
    assert len(events) >= 1
    event = events[0]
    assert event["type"] == "claim"
    assert event["group_key"] == "ev-group"
    # subsequent call with current index returns empty
    next_events, same_index = slots_group_service.get_events_since(current)
    assert len(next_events) == 0
    assert same_index == current


def test_cleanup_expired_groups():
    """Expired groups are cleaned up on next operation."""
    slots_group_service.clear()
    original_ttl = slots_group_service.GROUP_TTL_SECONDS
    slots_group_service.claim("exp-group", "m-1")

    saved_now = time.time

    def frozen_now():
        return saved_now() + original_ttl + 60

    try:
        time.time = frozen_now
        slots_group_service._cleanup()
        st = slots_group_service.stats()
        assert st["groups"] == 0
    finally:
        time.time = saved_now


def test_wait_returns_immediately_if_ready():
    """wait_for_slots returns immediately if group is already ready."""
    import asyncio

    slots_group_service.clear()
    slots_group_service.claim("w-group", "m-1")
    slots_group_service.publish("w-group", "m-1", {"slots": [1]})

    result = asyncio.run(slots_group_service.wait_for_slots("w-group", "slave-1", 5000))
    assert result["status"] == "ready"


def test_claim_after_fail_resets():
    """Claiming after a previous group expired creates a fresh group."""
    slots_group_service.clear()
    slots_group_service.claim("reset-group", "m-1")
    slots_group_service.fail("reset-group", "m-1", "some_error")
    result2 = slots_group_service.claim("reset-group", "m-2")
    assert result2["role"] == "slave"
