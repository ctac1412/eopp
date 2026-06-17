import asyncio
import json
from pathlib import Path


def test_top3_service_reads_cached_solver_top3_without_starting_pool():
    from src.services.top3_service import Top3ProcessPool

    pool = Top3ProcessPool(compute_func=lambda data: ["9"], max_workers=1)

    result = asyncio.run(pool.get_top3({"solver_top3": [2, 0, 1]}))

    assert result == ["2", "0", "1"]
    assert pool.started is False


def test_top3_service_reads_solver_results_without_starting_pool():
    from src.services.top3_service import Top3ProcessPool

    pool = Top3ProcessPool(compute_func=lambda data: ["9"], max_workers=1)

    result = asyncio.run(
        pool.get_top3(
            {
                "solver_results": [
                    {"variant": 1, "rank": 2, "score": 10},
                    {"variant": 0, "rank": 1, "score": 20},
                    {"variant": 2, "rank": 3, "score": 30},
                ]
            }
        )
    )

    assert result == ["0", "1", "2"]
    assert pool.started is False


def test_top3_service_computes_missing_metadata_in_executor():
    from concurrent.futures import ThreadPoolExecutor

    from src.services.top3_service import Top3ProcessPool

    calls = []

    def compute_func(data):
        calls.append(data["captcha_id"])
        return ["4", "3", "2"]

    pool = Top3ProcessPool(
        compute_func=compute_func,
        executor_factory=ThreadPoolExecutor,
        max_workers=1,
    )
    try:
        result = asyncio.run(pool.get_top3({"captcha_id": "cold"}))
        started_before_shutdown = pool.started
    finally:
        pool.shutdown()

    assert result == ["4", "3", "2"]
    assert calls == ["cold"]
    assert started_before_shutdown is True


def test_top3_service_falls_back_to_empty_top3_when_compute_fails():
    from concurrent.futures import ThreadPoolExecutor

    from src.services.top3_service import Top3ProcessPool

    def compute_func(data):
        raise RuntimeError("boom")

    pool = Top3ProcessPool(
        compute_func=compute_func,
        executor_factory=ThreadPoolExecutor,
        max_workers=1,
    )
    try:
        result = asyncio.run(pool.get_top3({"captcha_id": "cold"}))
    finally:
        pool.shutdown()

    assert result == []


def test_top3_service_falls_back_to_empty_top3_when_executor_startup_fails():
    from src.services.top3_service import Top3ProcessPool

    def executor_factory(**kwargs):
        raise RuntimeError("no workers")

    pool = Top3ProcessPool(
        compute_func=lambda data: ["1"],
        executor_factory=executor_factory,
        max_workers=1,
    )

    result = asyncio.run(pool.get_top3({"captcha_id": "cold"}))

    assert result == []
    assert pool.started is False


def test_top3_service_defaults_to_host_cpu_count(monkeypatch):
    from src.services.top3_service import Top3ProcessPool

    monkeypatch.delenv("EOPP_TOP3_PROCESS_WORKERS", raising=False)
    monkeypatch.setattr("src.services.top3_service.os.cpu_count", lambda: 16)

    pool = Top3ProcessPool()

    assert pool._max_workers == 16


def test_top3_service_health_reports_started_pool():
    from concurrent.futures import ThreadPoolExecutor

    from src.services.top3_service import Top3ProcessPool

    pool = Top3ProcessPool(executor_factory=ThreadPoolExecutor, max_workers=2)
    try:
        pool.startup(warmup=False)

        status = pool.health_status()
    finally:
        pool.shutdown()

    assert status["status"] == "ok"
    assert status["started"] is True
    assert status["workers"] == 2
    assert status["last_error"] is None


def test_top3_service_health_reports_failed_compute_without_sync_delay():
    from concurrent.futures import ThreadPoolExecutor

    from src.services.top3_service import Top3ProcessPool

    def compute_func(data):
        raise RuntimeError("boom")

    pool = Top3ProcessPool(
        compute_func=compute_func,
        executor_factory=ThreadPoolExecutor,
        max_workers=1,
    )
    try:
        result = asyncio.run(pool.get_top3({"captcha_id": "cold"}))
        status = pool.health_status()
    finally:
        pool.shutdown()

    assert result == []
    assert status["status"] == "degraded"
    assert status["started"] is True
    assert status["compute_errors"] == 1
    assert status["empty_returns"] == 1
    assert status["last_error"] == "boom"


def test_compute_top3_cpu_returns_empty_for_unsupported_puzzle_without_error():
    from src.services.top3_service import compute_top3_cpu

    payload_path = Path("server/data/captcha_examples/all/01230b7edbef363a.json")
    data = json.loads(payload_path.read_text(encoding="utf-8"))
    for key in ("solver_top3", "solver_results", "solver_valid_rank"):
        data.pop(key, None)

    assert compute_top3_cpu(data) == []


def test_compute_top3_cpu_preserves_solver_sorted_order_for_puzzle():
    from src.services.top3_service import compute_top3_cpu

    payload_path = Path("server/data/captcha_examples/all/d6a24b137f06797d.json")
    data = json.loads(payload_path.read_text(encoding="utf-8"))
    for key in ("solver_top3", "solver_results", "solver_valid_rank"):
        data.pop(key, None)

    assert compute_top3_cpu(data) == ["2", "7", "14"]
