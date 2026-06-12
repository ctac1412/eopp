"""Local Phase 8 load checks for peak captcha, realtime, and worker isolation.

These are deliberately lightweight pytest scenarios rather than an external
load-test harness. They run locally, exercise many pending captchas/operators,
and assert the regressions Phase 8 cares about: no global realtime freeze and
observable failed billing jobs.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta


def test_many_captchas_many_operators_slow_operator_and_failing_billing_are_observable(
    isolated_api_db,
):
    from src.core.captcha_runtime.sessions import CaptchaSession, CaptchaSessionStore
    from src.core.realtime.fanout import RealtimeFanout
    from src.core.realtime.registry import RealtimeRegistry, operator_api_key_id
    from src.db.connection import get_connection
    from src.platform.jobs.queue import enqueue_deferred_job
    from src.platform.jobs.worker import JobRegistry, run_due_jobs
    from src.platform.observability.metrics import reset_metrics, snapshot

    reset_metrics()
    registry = RealtimeRegistry(queue_maxsize=1)
    fanout = RealtimeFanout(registry)
    sessions = CaptchaSessionStore()
    owner_id = 42
    operator_ids = list(range(20))
    active_queues = []
    slow_queue = None

    active_queues.append(registry.register_connection(api_key_id=owner_id, ip="owner").queue)
    for operator_id in operator_ids:
        queue = registry.register_connection(
            api_key_id=operator_api_key_id(operator_id),
            ip=f"operator-{operator_id}",
        ).queue
        if operator_id == 0:
            queue.put_nowait("filled-by-slow-client")
            slow_queue = queue
        else:
            active_queues.append(queue)
    registry.set_master_operators(owner_id, operator_ids)

    start = time.perf_counter()
    for index in range(50):
        sessions.add_or_get(
            CaptchaSession(
                captcha_id=f"captcha-{index}",
                variants=[["a"], ["b"]],
                images={"0": "image-0", "1": "image-1"},
                usage_log_id=index,
                api_key_id=owner_id,
            )
        )
        result = fanout.push_to_owner_and_operators(
            {"type": "new_captcha", "captcha_id": f"captcha-{index}"},
            owner_api_key_id=owner_id,
        )
        assert result.delivered >= len(operator_ids)
        assert result.dropped >= 1
        for queue in active_queues:
            while not queue.empty():
                queue.get_nowait()

    elapsed_ms = (time.perf_counter() - start) * 1000
    assert elapsed_ms < 300
    assert slow_queue is not None
    assert slow_queue.get_nowait() == "filled-by-slow-client"

    registry_snapshot = snapshot()
    assert registry_snapshot["eopp_realtime_dropped_messages_total"] >= 50
    assert registry_snapshot["eopp_captcha_display_latency_ms_count"] >= 50

    registry_jobs = JobRegistry()
    registry_jobs.register(
        "billing.calculate_usage_price",
        lambda payload: (_ for _ in ()).throw(RuntimeError("tariff backend down")),
    )
    job = enqueue_deferred_job("billing.calculate_usage_price", {"usage_log_id": 99})

    first = run_due_jobs(registry=registry_jobs, max_jobs=1, max_attempts=2, retry_delay_seconds=1)
    assert first.failed == 1

    conn = get_connection()
    conn.execute(
        "UPDATE background_jobs SET next_retry_at = ? WHERE id = ?",
        ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(), job.id),
    )
    conn.commit()
    conn.close()

    second = run_due_jobs(registry=registry_jobs, max_jobs=1, max_attempts=2)
    assert second.dead_lettered == 1

    metrics = snapshot()
    assert metrics['eopp_background_job_failures_total{job_name="billing.calculate_usage_price"}'] == 2
    assert metrics["eopp_background_job_lag_seconds"] >= 0
