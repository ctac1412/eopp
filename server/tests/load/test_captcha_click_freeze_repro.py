"""Load repro for simultaneous solo and distributed captcha clicks.

Run directly when investigating click freezes:
    uv run pytest server/tests/load/test_captcha_click_freeze_repro.py -q -s

For soak runs:
    $env:EOPP_LOAD_ROUNDS='20'
    uv run pytest server/tests/load/test_captcha_click_freeze_repro.py -q -s

Useful toggles:
    EOPP_LOAD_REALTIME_READERS=0  # disable background realtime queue readers
    EOPP_LOAD_PRINT_ROUNDS=0      # hide per-wave timing lines
"""

from __future__ import annotations

import os
import statistics
import threading
import time
import tracemalloc
import ctypes
import ctypes.wintypes
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed


def _pct(values: list[float], percent: int) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * percent / 100) - 1))
    return ordered[index]


def _stats(values: list[float]) -> dict[str, float]:
    return {
        "count": len(values),
        "avg_ms": statistics.mean(values) if values else 0.0,
        "p50_ms": _pct(values, 50) if values else 0.0,
        "p95_ms": _pct(values, 95) if values else 0.0,
        "p99_ms": _pct(values, 99) if values else 0.0,
        "max_ms": max(values) if values else 0.0,
    }


def _fmt(label: str, stats: dict[str, float]) -> str:
    return (
        f"{label}: count={stats['count']} avg={stats['avg_ms']:.1f}ms "
        f"p50={stats['p50_ms']:.1f}ms p95={stats['p95_ms']:.1f}ms "
        f"p99={stats['p99_ms']:.1f}ms max={stats['max_ms']:.1f}ms"
    )


def _archive_backlog() -> int:
    from src.routes import distribution as distribution_route

    with distribution_route._answer_archive_futures_lock:
        return len(distribution_route._answer_archive_futures)


def _queue_depths() -> dict[str, float]:
    from src.sse.manager import registry as realtime_registry

    depths = [conn.queue.qsize() for conn in realtime_registry.snapshot()]
    return {
        "count": len(depths),
        "max": max(depths, default=0),
        "total": sum(depths),
    }


def _drain_realtime_queues() -> dict[str, float]:
    from src.sse.manager import registry as realtime_registry

    drained = 0
    for conn in realtime_registry.snapshot():
        while True:
            try:
                conn.queue.get_nowait()
            except Exception:
                break
            drained += 1
    depths = _queue_depths()
    depths["drained"] = drained
    return depths


def _compact_series(values: list, edge: int = 5) -> dict[str, object]:
    if len(values) <= edge * 2:
        return {"count": len(values), "values": values}
    return {
        "count": len(values),
        "first": values[:edge],
        "last": values[-edge:],
    }


def _rss_bytes() -> int | None:
    if os.name != "nt":
        try:
            import resource

            usage = resource.getrusage(resource.RUSAGE_SELF)
            return int(usage.ru_maxrss * 1024)
        except Exception:
            return None

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.wintypes.DWORD),
            ("PageFaultCount", ctypes.wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(ProcessMemoryCounters)
    handle = ctypes.windll.kernel32.GetCurrentProcess()
    for library_name, function_name in (
        ("psapi.dll", "GetProcessMemoryInfo"),
        ("kernel32.dll", "K32GetProcessMemoryInfo"),
    ):
        try:
            function = getattr(ctypes.WinDLL(library_name), function_name)
            function.argtypes = [
                ctypes.c_void_p,
                ctypes.POINTER(ProcessMemoryCounters),
                ctypes.wintypes.DWORD,
            ]
            function.restype = ctypes.wintypes.BOOL
            if function(handle, ctypes.byref(counters), counters.cb):
                return int(counters.WorkingSetSize)
        except Exception:
            continue
    return None


def _start_realtime_readers(stop_event: threading.Event) -> list[threading.Thread]:
    from src.sse.manager import registry as realtime_registry

    threads = []

    def drain_queue(queue) -> None:
        while not stop_event.is_set():
            try:
                queue.get_nowait()
            except Exception:
                time.sleep(0.001)

    for conn in realtime_registry.snapshot():
        thread = threading.Thread(
            target=drain_queue,
            args=(conn.queue,),
            daemon=True,
            name=f"load-sse-reader-{conn.api_key_id}",
        )
        thread.start()
        threads.append(thread)
    return threads


def _create_master(client, admin_token: str, index: int) -> tuple[str, int, str]:
    login = f"load.master.{index}"
    password = "strong-password"
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": f"Load Master {index}",
            "login": login,
            "password": password,
        },
    )
    assert user.status_code == 200, user.text
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": f"load-master-{index}", "max_uses": 10000, "user_id": user.json()["id"]},
    )
    assert key.status_code == 200, key.text
    from src.repositories import user_repo

    session_token = user_repo.create_session(user.json()["id"])
    return key.json()["key"], key.json()["id"], session_token


def _session_cookie(session_token: str) -> dict[str, str]:
    return {"cookie": f"eopp_session={session_token}"}


def _start_solo_pending(client, session_token: str, index: int) -> tuple[str, threading.Thread, dict]:
    from src.captcha_assembly import captcha_hash
    from src.sse import lock, pending

    puzzle = {
        "tiles": [{"tileId": f"tile-{index}-a", "imageData": "a"}],
        "variantsCapture": [[f"tile-{index}-a"], [f"tile-{index}-a"]],
    }
    captcha_id = captcha_hash({"puzzle": puzzle})
    result_holder: dict = {}

    def post_solve_captcha() -> None:
        result_holder["response"] = client.post(
            "/api/solve-captcha",
            headers=_session_cookie(session_token),
            json={
                "auto_solve": False,
                "timeout_metadata": True,
                "reservation_id": f"load-solo-reservation-{index}",
                "puzzle": puzzle,
            },
        )

    thread = threading.Thread(target=post_solve_captcha, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if "response" in result_holder:
            response = result_holder["response"]
            raise AssertionError(
                f"solo captcha {captcha_id} finished before pending: "
                f"status={response.status_code} body={response.text[:500]}"
            )
        with lock:
            if captcha_id in pending:
                return captcha_id, thread, result_holder
        time.sleep(0.01)
    with lock:
        pending_keys = list(pending)[:5]
        pending_count = len(pending)
    thread_names = [item.name for item in threading.enumerate()]
    response = result_holder.get("response")
    response_summary = (
        f"status={response.status_code} body={response.text[:500]}"
        if response is not None
        else "no response"
    )
    raise AssertionError(
        f"solo captcha {captcha_id} did not enter pending: "
        f"thread_alive={thread.is_alive()} response={response_summary} "
        f"pending_count={pending_count} pending_keys={pending_keys} "
        f"thread_count={len(thread_names)} thread_names={thread_names[:20]}"
    )


def _seed_distribution_state(api_key: str, key_id: int, index: int) -> str:
    from src.db import log_usage
    from src.routes.distribution import init_distribution_state

    captcha_id = f"load-distribution-{index}"
    usage_log_id = log_usage(api_key, f"load-distribution-reservation-{index}", captcha_id)
    icons_cache = {
        position: {"image": f"image-{index}-{position}", "icon": f"icon-{index}-{position}"}
        for position in range(5)
    }
    init_distribution_state(
        captcha_id=captcha_id,
        event=None,
        usage_log_id=usage_log_id,
        api_key_id=key_id,
        num_operators=3,
        icons_cache=icons_cache,
        captcha_data={"puzzle": {"imageBase64": "main", "iconsBase64": "icons"}},
    )
    return captcha_id


def test_seven_masters_mixed_solo_and_distribution_clicks_start_together(client, admin_token, monkeypatch):
    import src.routes.captcha as captcha_route
    from src.services import captcha_file_service
    from src.platform.observability.metrics import reset_metrics, snapshot
    from src.routes.captcha import _session_store
    from src.routes.distribution import (
        distribution_states,
        wait_for_distribution_answer_archives,
    )
    from src.sse.manager import registry as realtime_registry

    logging.getLogger("eopp").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.WARNING)

    monkeypatch.setattr(
        captcha_route,
        "assemble_captchas",
        lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
    )
    monkeypatch.setattr(captcha_file_service, "ensure_analysis_metadata", lambda data: False)

    reset_metrics()
    distribution_states.clear()
    tracemalloc.start()
    memory_before = tracemalloc.take_snapshot()
    rss_before = _rss_bytes()

    masters = [_create_master(client, admin_token, index) for index in range(7)]
    distributed = masters[:4]
    solo = masters[4:]

    for _, key_id, _session_token in masters:
        realtime_registry.register_connection(api_key_id=key_id, ip=f"load-master-{key_id}")

    reader_stop = threading.Event()
    reader_threads = (
        _start_realtime_readers(reader_stop)
        if os.environ.get("EOPP_LOAD_REALTIME_READERS", "1") != "0"
        else []
    )

    def run_wave(label: str, requests: list[tuple[str, dict]]) -> tuple[list[tuple[str, int, float, dict]], float]:
        barrier = threading.Barrier(len(requests))

        def submit(kind: str, request: dict) -> tuple[str, int, float, dict]:
            barrier.wait(timeout=5)
            start = time.perf_counter()
            response = client.post(
                request["path"],
                headers=_session_cookie(request["session_token"]),
                json=request["json"],
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            body = response.json()
            return kind, response.status_code, elapsed_ms, body

        wave_results = []
        start_all = time.perf_counter()
        with ThreadPoolExecutor(max_workers=len(requests)) as executor:
            futures = [executor.submit(submit, kind, request) for kind, request in requests]
            for future in as_completed(futures):
                wave_results.append(future.result())
        elapsed_ms = (time.perf_counter() - start_all) * 1000
        if print_waves:
            print(f"{label}_total_ms={elapsed_ms:.1f}")
        return wave_results, elapsed_ms

    rounds = int(os.environ.get("EOPP_LOAD_ROUNDS", "1"))
    print_waves = os.environ.get("EOPP_LOAD_PRINT_ROUNDS", "1" if rounds <= 20 else "0") != "0"
    results = []
    total_ms = 0.0
    round_state = []
    round_memory = []
    round_queues = []
    try:
        for round_index in range(rounds):
            offset = round_index * 100
            solo_captchas = [
                (session_token, *_start_solo_pending(client, session_token, offset + index))
                for index, (_api_key, _key_id, session_token) in enumerate(solo)
            ]
            distributed_captchas = [
                _seed_distribution_state(api_key, key_id, offset + index)
                for index, (api_key, key_id, _session_token) in enumerate(distributed)
            ]

            first_wave: list[tuple[str, dict]] = []
            second_wave: list[tuple[str, dict]] = []
            for session_token, captcha_id, _thread, _holder in solo_captchas:
                first_wave.append(
                    (
                        "solo",
                        {
                            "path": "/api/solve",
                            "session_token": session_token,
                            "json": {
                                "captcha_id": captcha_id,
                                "variantIndex": 0,
                            },
                        },
                    )
                )

            for captcha_index, captcha_id in enumerate(distributed_captchas):
                session_token = distributed[captcha_index][2]
                for operator_id, icon_position in ((0, 0), (1, 4), (2, 2)):
                    first_wave.append(
                        (
                            "distributed",
                            {
                                "path": "/api/distribution/answer",
                                "session_token": session_token,
                                "json": {
                                    "captcha_id": captcha_id,
                                    "operator_id": operator_id,
                                    "icon_position": icon_position,
                                    "x": 100 + icon_position,
                                    "y": 200 + icon_position,
                                },
                            },
                        )
                    )
                for operator_id, icon_position in ((0, 1), (1, 3)):
                    second_wave.append(
                        (
                            "distributed",
                            {
                                "path": "/api/distribution/answer",
                                "session_token": session_token,
                                "json": {
                                    "captcha_id": captcha_id,
                                    "operator_id": operator_id,
                                    "icon_position": icon_position,
                                    "x": 100 + icon_position,
                                    "y": 200 + icon_position,
                                },
                            },
                        )
                    )

            first_results, first_total_ms = run_wave(f"round_{round_index}_first_wave", first_wave)
            second_results, second_total_ms = run_wave(f"round_{round_index}_second_wave", second_wave)
            results.extend(first_results + second_results)
            total_ms += first_total_ms + second_total_ms

            for _session_token, _captcha_id, thread, holder in solo_captchas:
                thread.join(timeout=5)
                assert "response" in holder
                assert holder["response"].status_code == 200, holder["response"].text

            wait_for_distribution_answer_archives(timeout=5)
            queue_depths_before_drain = _queue_depths()
            queue_depths_after_drain = (
                _drain_realtime_queues()
                if os.environ.get("EOPP_LOAD_DRAIN_SSE", "1") != "0"
                else queue_depths_before_drain
            )
            round_state.append((_session_store.count(), len(distribution_states)))
            current_bytes, peak_bytes = tracemalloc.get_traced_memory()
            round_memory.append((current_bytes, peak_bytes))
            round_queues.append(
                {
                    "before_drain": queue_depths_before_drain,
                    "after_drain": queue_depths_after_drain,
                    "rss_bytes": _rss_bytes(),
                }
            )
    finally:
        reader_stop.set()
        for thread in reader_threads:
            thread.join(timeout=1)

    memory_after = tracemalloc.take_snapshot()
    memory_delta = sum(stat.size_diff for stat in memory_after.compare_to(memory_before, "filename"))
    top_allocations = memory_after.compare_to(memory_before, "filename")[:5]
    rss_after = _rss_bytes()

    solo_latencies = [elapsed for kind, status, elapsed, _ in results if kind == "solo" and status == 200]
    distributed_latencies = [elapsed for kind, status, elapsed, _ in results if kind == "distributed" and status == 200]
    statuses = {}
    for kind, status, _, _ in results:
        statuses[(kind, status)] = statuses.get((kind, status), 0) + 1

    evidence = {
        "total_ms": total_ms,
        "statuses": statuses,
        "solo": _stats(solo_latencies),
        "distributed": _stats(distributed_latencies),
        "pending_count": _session_store.count(),
        "distribution_states": len(distribution_states),
        "realtime_connections": len(realtime_registry.snapshot()),
        "realtime_queue_depths": _queue_depths(),
        "archive_backlog": _archive_backlog(),
        "memory_delta_bytes": memory_delta,
        "memory_current_peak_bytes": tracemalloc.get_traced_memory(),
        "rss_before_after_delta": (
            rss_before,
            rss_after,
            rss_after - rss_before if rss_before is not None and rss_after is not None else None,
        ),
        "realtime_reader_threads": len(reader_threads),
        "round_state": round_state,
        "round_memory": round_memory,
        "round_queues": round_queues,
        "metrics": snapshot(),
    }
    solve_submit_count = snapshot().get('eopp_captcha_solve_duration_ms_count{mode="submit"}', 0)
    dist_total_count = snapshot().get("eopp_distribution_answer_total_ms_count", 0)

    print()
    print("=== captcha click load repro: 7 masters, 4x2 operators, 3 solo ===")
    print(f"rounds={rounds}")
    print(f"total_ms={total_ms:.1f}")
    print(f"statuses={statuses}")
    print(_fmt("solo /api/solve", evidence["solo"]))
    print(_fmt("distributed /api/distribution/answer", evidence["distributed"]))
    print(
        "state: "
        f"pending={evidence['pending_count']} "
        f"distribution_states={evidence['distribution_states']} "
        f"realtime_connections={evidence['realtime_connections']} "
        f"realtime_queue_depths={evidence['realtime_queue_depths']} "
        f"archive_backlog={evidence['archive_backlog']} "
        f"memory_delta_bytes={memory_delta} "
        f"rss_before_after_delta={evidence['rss_before_after_delta']} "
        f"realtime_reader_threads={evidence['realtime_reader_threads']}"
    )
    print(f"round_state={round_state}")
    print(f"round_memory={_compact_series(round_memory)}")
    print(f"round_queues={_compact_series(round_queues, edge=3)}")
    print(
        "top_allocations="
        + repr(
            [
                {
                    "file": str(stat.traceback[0].filename),
                    "size_diff": stat.size_diff,
                    "count_diff": stat.count_diff,
                }
                for stat in top_allocations
            ]
        )
    )
    print(
        "metrics: "
        f"solve_submit_count={solve_submit_count} "
        f"dist_total_count={dist_total_count}"
    )

    assert statuses == {("solo", 200): 3 * rounds, ("distributed", 200): 20 * rounds}, evidence
    assert evidence["solo"]["max_ms"] < float(os.environ.get("EOPP_LOAD_SOLO_MAX_MS", "1000")), evidence
    assert evidence["distributed"]["max_ms"] < float(os.environ.get("EOPP_LOAD_DISTRIBUTED_MAX_MS", "1000")), evidence
    assert evidence["pending_count"] == 0, evidence
    assert evidence["distribution_states"] == 0, evidence
    assert evidence["archive_backlog"] == 0, evidence
    assert all(state == (0, 0) for state in round_state), evidence
