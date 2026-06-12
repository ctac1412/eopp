"""Regression tests for Phase 8 observability and Moscow peak-mode rules."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def test_peak_fast_mode_schedule_uses_moscow_windows(monkeypatch):
    from src.constants import is_peak_fast_mode_active

    monkeypatch.delenv("PEAK_FAST_MODE", raising=False)
    monkeypatch.delenv("EOPP_PEAK_FAST_MODE", raising=False)

    moscow = timezone(timedelta(hours=3), "Europe/Moscow")

    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 9, 49, tzinfo=moscow)) is False
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 9, 50, tzinfo=moscow)) is True
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 10, 10, tzinfo=moscow)) is True
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 10, 11, tzinfo=moscow)) is False
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 11, 50, tzinfo=moscow)) is True
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 12, 10, tzinfo=moscow)) is True
    assert is_peak_fast_mode_active(datetime(2026, 6, 11, 12, 11, tzinfo=moscow)) is False


def test_peak_fast_mode_env_override_still_forces_fast_mode(monkeypatch):
    from src.constants import is_peak_fast_mode_active

    monkeypatch.setenv("PEAK_FAST_MODE", "1")
    monkeypatch.delenv("EOPP_PEAK_FAST_MODE", raising=False)

    assert (
        is_peak_fast_mode_active(
            datetime(2026, 6, 11, 8, 0, tzinfo=timezone(timedelta(hours=3), "Europe/Moscow"))
        )
        is True
    )


def test_observability_collector_renders_required_phase8_metrics():
    from src.platform.observability.metrics import (
        counter_inc,
        gauge_set,
        histogram_observe,
        render_prometheus,
        reset_metrics,
        snapshot,
    )

    reset_metrics()

    histogram_observe("captcha_solve_duration_ms", 42.5)
    histogram_observe("captcha_display_latency_ms", 12.0)
    histogram_observe("usage_confirm_core_duration_ms", 7.25)
    gauge_set("captcha_pending_count", 3)
    gauge_set("realtime_queue_depth", 5, target="operator")
    counter_inc("realtime_dropped_messages_total", labels={"target": "operator"})
    gauge_set("background_job_lag_seconds", 4.5)
    counter_inc("background_job_failures_total", labels={"job_name": "billing.calculate_usage_price"})

    current = snapshot()
    rendered = render_prometheus()

    assert current["eopp_captcha_solve_duration_ms_count"] == 1
    assert current["eopp_captcha_solve_duration_ms_sum"] == 42.5
    assert 'eopp_realtime_queue_depth{target="operator"} 5' in rendered
    assert 'eopp_realtime_dropped_messages_total{target="operator"} 1' in rendered
    assert 'eopp_background_job_failures_total{job_name="billing.calculate_usage_price"} 1' in rendered
    assert "eopp_captcha_pending_count 3" in rendered
