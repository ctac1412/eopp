"""Process-local observability primitives for protected-core hot paths.

This module is intentionally small and dependency-free. It gives the local
server, tests, and `/metrics` endpoint a Prometheus-compatible view of captcha,
realtime, usage-confirm, and background-job behavior without coupling protected
core code to FastAPI route state or external collectors.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock

logger = logging.getLogger("eopp.metrics")
METRIC_PREFIX = "eopp"
_lock = Lock()
_metrics: dict[str, float] = {}


def _labels_key(labels: dict[str, object] | None = None) -> str:
    """Return the stable Prometheus label suffix for a metric key."""

    if not labels:
        return ""
    parts = [f'{key}="{str(value).replace(chr(34), chr(92) + chr(34))}"' for key, value in sorted(labels.items())]
    return "{" + ",".join(parts) + "}"


def _metric_key(name: str, labels: dict[str, object] | None = None) -> str:
    """Return the canonical in-memory key for a metric name and labels."""

    metric_name = name if name.startswith(f"{METRIC_PREFIX}_") else f"{METRIC_PREFIX}_{name}"
    return f"{metric_name}{_labels_key(labels)}"


def reset_metrics() -> None:
    """Clear all process-local metrics.

    This is only for tests and local diagnostics; production scrapes should read
    the monotonic counters as-is for the lifetime of the process.
    """

    with _lock:
        _metrics.clear()


def counter_inc(
    name: str,
    value: float = 1.0,
    labels: dict[str, object] | None = None,
    **label_kwargs: object,
) -> None:
    """Increment a Prometheus counter, preserving names ending in `_total`."""

    metric_name = name if name.endswith("_total") else f"{name}_total"
    merged_labels = {**(labels or {}), **label_kwargs}
    key = _metric_key(metric_name, merged_labels)
    with _lock:
        _metrics[key] = _metrics.get(key, 0.0) + value


def gauge_set(
    name: str,
    value: float,
    labels: dict[str, object] | None = None,
    **label_kwargs: object,
) -> None:
    """Set a Prometheus gauge to the latest observed value."""

    merged_labels = {**(labels or {}), **label_kwargs}
    with _lock:
        _metrics[_metric_key(name, merged_labels)] = float(value)


def histogram_observe(
    name: str,
    value: float,
    labels: dict[str, object] | None = None,
    **label_kwargs: object,
) -> None:
    """Record a lightweight histogram sample as `_count` and `_sum` series."""

    merged_labels = {**(labels or {}), **label_kwargs}
    count_key = _metric_key(f"{name}_count", merged_labels)
    sum_key = _metric_key(f"{name}_sum", merged_labels)
    with _lock:
        _metrics[count_key] = _metrics.get(count_key, 0.0) + 1.0
        _metrics[sum_key] = _metrics.get(sum_key, 0.0) + float(value)


def snapshot() -> dict[str, float]:
    """Return a copy of all metrics for tests and health diagnostics."""

    with _lock:
        return dict(_metrics)


def render_prometheus() -> str:
    """Render current metrics in Prometheus text exposition format."""

    with _lock:
        lines = [f"{key} {_format_number(value)}" for key, value in sorted(_metrics.items())]
    lines.append("")
    return "\n".join(lines)


def _format_number(value: float) -> str:
    """Format integer-valued floats without a trailing decimal point."""

    return str(int(value)) if float(value).is_integer() else str(value)


def observe_latency_ms(name: str, duration_ms: float, **labels: object) -> None:
    """Record a latency sample through logs and the in-memory collector."""

    metric_name = name.replace(".", "_")
    histogram_observe(metric_name if metric_name.endswith("_ms") else f"{metric_name}_duration_ms", duration_ms, labels)
    label_text = " ".join(f"{key}={value}" for key, value in labels.items())
    logger.debug("latency_metric name=%s duration_ms=%.1f %s", name, duration_ms, label_text)


@contextmanager
def latency_timer(name: str, **labels: object) -> Iterator[None]:
    """Measure elapsed time for a block and emit it as a latency sample."""
    start = time.perf_counter()
    try:
        yield
    finally:
        observe_latency_ms(name, (time.perf_counter() - start) * 1000, **labels)
