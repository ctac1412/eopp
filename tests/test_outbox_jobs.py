"""Regression tests for durable jobs and core failure isolation."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta


def _fetch_all(conn, table: str) -> list[dict]:
    return [dict(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()]


def test_enqueue_deferred_job_is_durable_and_idempotent(isolated_api_db):
    from src.db.connection import get_connection
    from src.platform.jobs.queue import enqueue_deferred_job

    first = enqueue_deferred_job(
        "captcha_archive",
        {"captcha_id": "captcha-1", "data": {"puzzle": {"tiles": []}}},
    )
    second = enqueue_deferred_job(
        "captcha_archive",
        {"captcha_id": "captcha-1", "data": {"puzzle": {"tiles": []}}},
    )

    conn = get_connection()
    jobs = _fetch_all(conn, "background_jobs")
    events = _fetch_all(conn, "outbox_events")
    conn.close()

    assert first.id == second.id
    assert len(jobs) == 1
    assert jobs[0]["job_name"] == "captcha_archive"
    assert jobs[0]["idempotency_key"] == "captcha_archive:captcha-1"
    assert jobs[0]["status"] == "pending"
    assert json.loads(jobs[0]["payload_json"])["captcha_id"] == "captcha-1"
    assert len(events) == 1
    assert events[0]["event_type"] == "job.enqueued"
    assert events[0]["status"] == "pending"


def test_worker_retries_then_dead_letters_failed_jobs(isolated_api_db):
    from src.db.connection import get_connection
    from src.platform.jobs.queue import enqueue_deferred_job
    from src.platform.jobs.worker import JobRegistry, run_due_jobs

    attempts = []

    def always_fails(payload):
        attempts.append(payload["usage_log_id"])
        raise RuntimeError("billing unavailable")

    registry = JobRegistry()
    registry.register("billing_confirm", always_fails)
    job = enqueue_deferred_job("billing_confirm", {"usage_log_id": 42})

    result = run_due_jobs(registry=registry, max_jobs=1, max_attempts=2)
    assert result.failed == 1

    conn = get_connection()
    row = dict(conn.execute("SELECT * FROM background_jobs WHERE id = ?", (job.id,)).fetchone())
    assert row["status"] == "pending"
    assert row["attempts"] == 1
    assert "billing unavailable" in row["last_error"]

    conn.execute(
        "UPDATE background_jobs SET next_retry_at = ? WHERE id = ?",
        ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(), job.id),
    )
    conn.commit()
    conn.close()

    result = run_due_jobs(registry=registry, max_jobs=1, max_attempts=2)
    assert result.dead_lettered == 1
    assert attempts == [42, 42]

    conn = get_connection()
    row = dict(conn.execute("SELECT * FROM background_jobs WHERE id = ?", (job.id,)).fetchone())
    conn.close()
    assert row["status"] == "dead"
    assert row["attempts"] == 2


def test_worker_marks_successful_job_done_once(isolated_api_db):
    from src.db.connection import get_connection
    from src.platform.jobs.queue import enqueue_deferred_job
    from src.platform.jobs.worker import JobRegistry, run_due_jobs

    handled = []
    registry = JobRegistry()
    registry.register("usage_enrich", lambda payload: handled.append(payload["usage_log_id"]))
    job = enqueue_deferred_job("usage_enrich", {"usage_log_id": 7})

    result = run_due_jobs(registry=registry, max_jobs=10)
    result_again = run_due_jobs(registry=registry, max_jobs=10)

    conn = get_connection()
    row = dict(conn.execute("SELECT * FROM background_jobs WHERE id = ?", (job.id,)).fetchone())
    conn.close()

    assert handled == [7]
    assert result.succeeded == 1
    assert result_again.processed == 0
    assert row["status"] == "done"


def test_default_registry_keeps_legacy_aliases_on_current_modules(isolated_api_db):
    from src.modules.billing.jobs import calculate_usage_price
    from src.modules.crm.jobs import enrich_usage
    from src.platform.jobs.worker import default_registry

    registry = default_registry()

    assert registry.get("usage_enrich") is enrich_usage
    assert registry.get("billing_confirm") is calculate_usage_price


def test_confirm_usage_survives_failed_deferred_enqueue(monkeypatch, client, api_key, active_sse):
    monkeypatch.setenv("PEAK_FAST_MODE", "1")

    register_response = client.post(
        "/api/register-usage",
        json={
            "api_key": api_key,
            "reservation_id": "reservation-1",
            "captcha_id": "captcha-1",
            "config_json": {"mode": "create"},
        },
    )
    assert register_response.status_code == 200
    usage_log_id = register_response.json()["usage_log_id"]

    def explode(*args, **kwargs):
        raise RuntimeError("queue storage is down")

    monkeypatch.setattr("src.db.usage_log.enqueue_deferred_job", explode)
    monkeypatch.setattr("src.services.usage_service.enqueue_deferred_job", explode)

    confirm_response = client.post(
        "/api/confirm-usage",
        json={"api_key": api_key, "usage_log_id": usage_log_id, "slot_date": "2026-06-11"},
    )

    assert confirm_response.status_code == 200
    assert confirm_response.json() == {"ok": True}


def test_confirm_usage_defers_telegram_even_when_sync_flag_enabled(
    monkeypatch, client, api_key, active_sse
):
    from src.db.connection import get_connection

    monkeypatch.delenv("PEAK_FAST_MODE", raising=False)
    monkeypatch.delenv("EOPP_PEAK_FAST_MODE", raising=False)
    monkeypatch.setenv("EOPP_USAGE_SYNC_BILLING_ENABLED", "1")

    register_response = client.post(
        "/api/register-usage",
        json={
            "api_key": api_key,
            "reservation_id": "reservation-telegram-deferred",
            "captcha_id": "captcha-telegram-deferred",
            "config_json": {"mode": "create"},
        },
    )
    assert register_response.status_code == 200
    usage_log_id = register_response.json()["usage_log_id"]

    monkeypatch.setattr(
        "src.services.telegram_service.notify_confirmed_usage",
        lambda usage: (_ for _ in ()).throw(RuntimeError("telegram should be deferred")),
    )

    confirm_response = client.post(
        "/api/confirm-usage",
        json={"api_key": api_key, "usage_log_id": usage_log_id, "slot_date": "2026-06-15"},
    )

    assert confirm_response.status_code == 200
    assert confirm_response.json() == {"ok": True}

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT job_name, payload_json FROM background_jobs WHERE job_name = 'telegram_confirmed_usage'"
        ).fetchone()
    finally:
        conn.close()

    assert row is not None
    assert json.loads(row["payload_json"]) == {"usage_log_id": usage_log_id}


def test_fail_usage_defers_captcha_record_parsing(monkeypatch, client, api_key, active_sse):
    from src.db.connection import get_connection

    register_response = client.post(
        "/api/register-usage",
        json={
            "api_key": api_key,
            "reservation_id": "reservation-failed-captcha",
            "captcha_id": "captcha-failed",
            "config_json": {"mode": "create", "captcha_source": "eopp"},
        },
    )
    assert register_response.status_code == 200
    usage_log_id = register_response.json()["usage_log_id"]

    def explode(*args, **kwargs):
        raise RuntimeError("captcha parser should be deferred")

    monkeypatch.setattr("src.db.captchas.create_captcha_records", explode)

    fail_response = client.post(
        "/api/fail-usage",
        json={
            "api_key": api_key,
            "usage_log_id": usage_log_id,
            "error_message": "captcha failed",
            "error_stage": "captcha",
            "slot_date": "2026-06-15",
            "logs": [
                "15:17:15.5 <log-version>v2</log-version>",
                '{"event":"stage_end","stage":"solving","status":"error","endpoint":"solve-captcha","captcha_id":"48fef3307bde851f","error":"timeout"}',
            ],
        },
    )

    assert fail_response.status_code == 200
    assert fail_response.json() == {"ok": True}

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT job_name, payload_json FROM background_jobs WHERE job_name = 'captcha_records'"
        ).fetchone()
    finally:
        conn.close()

    assert row is not None
    assert json.loads(row["payload_json"]) == {
        "usage_log_id": usage_log_id,
        "status": "failed",
    }


def test_confirm_usage_sync_flags_are_compatibility_only(monkeypatch, isolated_api_db):
    from src.db import create_key, log_usage
    from src.db.connection import get_connection
    from src.db.usage_log import confirm_usage

    key = create_key(label="confirm-sync-compat")
    usage_log_id = log_usage(key["key"], "reservation-sync-compat", "captcha-sync-compat")

    import src.modules.usage.jobs as usage_jobs

    assert not hasattr(usage_jobs, "confirm_billing")
    monkeypatch.setattr(
        "src.modules.billing.jobs.calculate_usage_price",
        lambda payload: (_ for _ in ()).throw(RuntimeError("billing should be deferred")),
    )
    monkeypatch.setattr(
        "src.db.captchas.create_captcha_records",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("captcha parsing should be deferred")),
    )

    assert (
        confirm_usage(
            usage_log_id,
            logs=[
                "15:17:15.5 <log-version>v2</log-version>",
                '{"event":"stage_end","stage":"solving","status":"error","endpoint":"solve-captcha","captcha_id":"48fef3307bde851f","error":"timeout"}',
            ],
            sync_billing=True,
            sync_captcha_records=True,
        )
        is True
    )

    conn = get_connection()
    try:
        jobs = [
            (row["job_name"], json.loads(row["payload_json"]))
            for row in conn.execute("SELECT job_name, payload_json FROM background_jobs ORDER BY id")
        ]
    finally:
        conn.close()

    assert ("billing.calculate_usage_price", {"usage_log_id": usage_log_id}) in jobs
    assert ("captcha_records", {"usage_log_id": usage_log_id, "status": "confirmed"}) in jobs
