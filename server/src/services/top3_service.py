"""Process-backed top3 solver service for captcha display hints."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from collections.abc import Callable
from concurrent.futures import Executor, ProcessPoolExecutor
from typing import Any

from src.captcha_assembly import get_solver_results_from_metadata, is_icon_click_type

logger = logging.getLogger("eopp.top3")


def cheap_get_top3_from_metadata(data: dict[str, Any]) -> list[str] | None:
    """Return already persisted top3 hints without invoking the CPU-bound solver."""

    if is_icon_click_type(data):
        return ["0"]

    top3 = data.get("solver_top3")
    if isinstance(top3, list) and all(isinstance(item, int) for item in top3):
        return [str(item) for item in top3[:3]]

    results = get_solver_results_from_metadata(data)
    if results:
        return [str(item["variant"]) for item in results[:3] if isinstance(item.get("variant"), int)]

    return None


def compute_top3_cpu(data: dict[str, Any]) -> list[str]:
    """Compute top3 variants in a pickle-safe worker function."""

    from captcha_solver import (
        EDGE_TRIM,
        build_captcha_context,
        classify_captcha,
        solve_prepared_captcha,
        top_variants,
    )

    context = build_captcha_context(data)
    classification = classify_captcha(context)
    output = solve_prepared_captcha(
        context,
        classification,
        edge_trim=EDGE_TRIM,
        verbose=False,
    )
    return [str(variant) for variant in top_variants(output.results)]


def _warm_top3_worker() -> bool:
    from captcha_solver import (
        build_captcha_context,
        classify_captcha,
        solve_prepared_captcha,
        top_variants,
    )

    return all((build_captcha_context, classify_captcha, solve_prepared_captcha, top_variants))


class Top3ProcessPool:
    """Long-lived executor for CPU-bound top3 computation outside protected core."""

    def __init__(
        self,
        *,
        compute_func: Callable[[dict[str, Any]], list[str]] = compute_top3_cpu,
        executor_factory: Callable[..., Executor] = ProcessPoolExecutor,
        max_workers: int | None = None,
    ) -> None:
        self._compute_func = compute_func
        self._executor_factory = executor_factory
        self._max_workers = max_workers if max_workers is not None else _default_workers()
        self._executor: Executor | None = None
        self._lock = threading.Lock()
        self._submitted = 0
        self._succeeded = 0
        self._compute_errors = 0
        self._empty_returns = 0
        self._last_error: str | None = None

    @property
    def started(self) -> bool:
        return self._executor is not None

    def health_status(self) -> dict[str, Any]:
        """Return process-pool health for operational dashboards."""

        with self._lock:
            compute_errors = self._compute_errors
            last_error = self._last_error
            return {
                "status": "ok" if self.started and compute_errors == 0 else "degraded",
                "started": self.started,
                "workers": self._max_workers,
                "submitted": self._submitted,
                "succeeded": self._succeeded,
                "compute_errors": compute_errors,
                "empty_returns": self._empty_returns,
                "last_error": last_error,
            }

    def startup(self, *, warmup: bool = True) -> None:
        if self._executor is not None:
            return
        try:
            self._executor = self._executor_factory(max_workers=self._max_workers)
        except Exception as exc:
            logger.warning("top3_pool_startup_failed error=%s", exc)
            self._record_error(exc, empty_return=False)
            self._executor = None
            return
        if warmup:
            futures = [self._executor.submit(_warm_top3_worker) for _ in range(self._max_workers)]
            for future in futures:
                try:
                    future.result(timeout=10)
                except Exception as exc:
                    logger.warning("top3_pool_warmup_failed error=%s", exc)
                    self._record_error(exc, empty_return=False)
                    self.shutdown()
                    return

    def shutdown(self) -> None:
        executor = self._executor
        self._executor = None
        if executor is not None:
            executor.shutdown(wait=False, cancel_futures=True)

    async def get_top3(self, data: dict[str, Any]) -> list[str]:
        cached = cheap_get_top3_from_metadata(data)
        if cached is not None:
            return cached

        try:
            result = await self.compute(data)
            if result:
                self._record_success()
            else:
                self._record_empty()
            return result
        except Exception as exc:
            logger.warning("top3_compute_failed error=%s", exc)
            self._record_error(exc, empty_return=True)
            return []

    async def compute(self, data: dict[str, Any]) -> list[str]:
        if self._executor is None:
            self.startup(warmup=False)
        if self._executor is None:
            raise RuntimeError("top3 executor unavailable")
        loop = asyncio.get_running_loop()
        with self._lock:
            self._submitted += 1
        return await loop.run_in_executor(self._executor, self._compute_func, data)

    def _record_success(self) -> None:
        with self._lock:
            self._succeeded += 1

    def _record_empty(self) -> None:
        with self._lock:
            self._empty_returns += 1

    def _record_error(self, exc: Exception, *, empty_return: bool) -> None:
        with self._lock:
            self._compute_errors += 1
            if empty_return:
                self._empty_returns += 1
            self._last_error = str(exc)


def _default_workers() -> int:
    configured = os.getenv("EOPP_TOP3_PROCESS_WORKERS")
    if configured:
        try:
            return max(1, int(configured))
        except ValueError:
            logger.warning("invalid EOPP_TOP3_PROCESS_WORKERS=%s", configured)
    return max(1, os.cpu_count() or 1)


top3_process_pool = Top3ProcessPool()
