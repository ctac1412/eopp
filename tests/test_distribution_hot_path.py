from datetime import UTC, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time


def test_distribution_answer_save_does_not_run_runtime_schema_changes(
    isolated_api_db,
):
    from sqlalchemy import event

    from src.entities import get_engine
    from src.repositories import distribution_repo

    schema_sql: list[str] = []

    def capture_sql(conn, cursor, statement, parameters, context, executemany):
        if "ALTER TABLE distribution_answers" in statement:
            schema_sql.append(statement)

    engine = get_engine()
    event.listen(engine, "before_cursor_execute", capture_sql)

    try:
        distribution_repo.save_distribution_answer(
            usage_log_id=1,
            captcha_id="hot-path-captcha",
            operator_id=1,
            icon_position=4,
            x=120,
            y=180,
            duration_ms=450,
        )
    finally:
        event.remove(engine, "before_cursor_execute", capture_sql)

    assert schema_sql == []


def test_distribution_answer_save_persists_click_on_current_schema(isolated_api_db):
    from src.entities import DistributionAnswer, get_session
    from src.repositories import distribution_repo

    distribution_repo.save_distribution_answer(
        usage_log_id=1,
        captcha_id="hot-path-persist",
        operator_id=2,
        icon_position=3,
        x=99,
        y=101,
        duration_ms=250,
    )

    with get_session() as session:
        row = (
            session.query(DistributionAnswer)
            .filter(DistributionAnswer.captcha_id == "hot-path-persist")
            .one()
        )

    assert row.usage_log_id == 1
    assert row.operator_id == 2
    assert row.icon_position == 3
    assert row.duration_ms == 250
    assert datetime.fromisoformat(row.created_at).tzinfo == UTC


def test_distribution_answer_save_reproduces_and_removes_schema_lock_freeze(
    isolated_api_db,
):
    from sqlalchemy import event, text

    from src.entities import get_engine, get_session
    from src.repositories import distribution_repo

    schema_lock = threading.Lock()
    alter_count_by_mode = {"legacy": 0, "fixed": 0}
    current_mode = "fixed"

    def simulate_schema_lock(conn, cursor, statement, parameters, context, executemany):
        if "ALTER TABLE distribution_answers" in statement:
            with schema_lock:
                alter_count_by_mode[current_mode] += 1
                time.sleep(0.05)

    def legacy_runtime_schema_checks() -> None:
        with get_session() as session:
            for statement in (
                "ALTER TABLE distribution_answers ADD COLUMN usage_log_id INTEGER DEFAULT 0",
                "ALTER TABLE distribution_answers ADD COLUMN duration_ms INTEGER",
            ):
                try:
                    session.execute(text(statement))
                    session.commit()
                except Exception:
                    session.rollback()

    def save_one(index: int, legacy_schema_checks: bool) -> float:
        start = time.perf_counter()
        if legacy_schema_checks:
            legacy_runtime_schema_checks()
        distribution_repo.save_distribution_answer(
            usage_log_id=index + 1,
            captcha_id=f"schema-lock-captcha-{index}-{time.perf_counter_ns()}",
            operator_id=(index % 4) + 1,
            icon_position=index % 5,
            x=120 + index,
            y=180 + index,
            duration_ms=450,
        )
        return (time.perf_counter() - start) * 1000

    def run_batch(workers: int, legacy_schema_checks: bool) -> float:
        latencies = []
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(save_one, index, legacy_schema_checks)
                for index in range(workers * 2)
            ]
            for future in as_completed(futures):
                latencies.append(future.result())
        latencies.sort()
        return latencies[int(len(latencies) * 0.95) - 1]

    engine = get_engine()
    event.listen(engine, "before_cursor_execute", simulate_schema_lock)

    try:
        current_mode = "legacy"
        legacy_single_thread_p95 = run_batch(workers=1, legacy_schema_checks=True)
        legacy_four_thread_p95 = run_batch(workers=4, legacy_schema_checks=True)

        current_mode = "fixed"
        fixed_single_thread_p95 = run_batch(workers=1, legacy_schema_checks=False)
        fixed_four_thread_p95 = run_batch(workers=4, legacy_schema_checks=False)
    finally:
        event.remove(engine, "before_cursor_execute", simulate_schema_lock)

    evidence = {
        "legacy_single_thread_p95_ms": legacy_single_thread_p95,
        "legacy_four_thread_p95_ms": legacy_four_thread_p95,
        "legacy_alter_count": alter_count_by_mode["legacy"],
        "fixed_single_thread_p95_ms": fixed_single_thread_p95,
        "fixed_four_thread_p95_ms": fixed_four_thread_p95,
        "fixed_alter_count": alter_count_by_mode["fixed"],
    }

    assert legacy_single_thread_p95 < 150, evidence
    assert legacy_four_thread_p95 > 300, evidence
    assert legacy_four_thread_p95 > legacy_single_thread_p95 * 2, evidence
    assert alter_count_by_mode["legacy"] == 20, evidence

    assert fixed_single_thread_p95 < 150, evidence
    assert fixed_four_thread_p95 < 150, evidence
    assert alter_count_by_mode["fixed"] == 0, evidence


def test_distribution_answer_route_handles_four_parallel_operators_without_second_scale_stalls(
    client,
):
    from src.routes.distribution import (
        distribution_states,
        init_distribution_state,
        wait_for_distribution_answer_archives,
    )

    distribution_states.clear()
    icons_cache = {
        position: {"image": f"image-{position}", "icon": f"icon-{position}"}
        for position in range(5)
    }
    requests = []
    rounds = 25
    for round_index in range(rounds):
        captcha_id = f"load-captcha-{round_index}"
        init_distribution_state(
            captcha_id=captcha_id,
            event=None,
            usage_log_id=round_index + 1,
            api_key_id=1,
            num_operators=5,
            icons_cache=icons_cache,
            captcha_data={"puzzle": {"imageBase64": "main", "iconsBase64": "icons"}},
        )
        requests.extend(
            [
                {
                    "captcha_id": captcha_id,
                    "operator_id": 1,
                    "icon_position": 4,
                    "x": 40,
                    "y": 80,
                },
                {
                    "captcha_id": captcha_id,
                    "operator_id": 2,
                    "icon_position": 3,
                    "x": 80,
                    "y": 80,
                },
                {
                    "captcha_id": captcha_id,
                    "operator_id": 3,
                    "icon_position": 2,
                    "x": 120,
                    "y": 80,
                },
                {
                    "captcha_id": captcha_id,
                    "operator_id": 4,
                    "icon_position": 1,
                    "x": 160,
                    "y": 80,
                },
            ]
        )

    def submit(payload):
        start = time.perf_counter()
        response = client.post("/distribution/answer", json=payload)
        elapsed_ms = (time.perf_counter() - start) * 1000
        return response.status_code, elapsed_ms, response.json()

    latencies = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(submit, payload) for payload in requests]
        for future in as_completed(futures):
            status_code, elapsed_ms, body = future.result()
            assert status_code == 200, body
            latencies.append(elapsed_ms)

    latencies.sort()
    p95 = latencies[int(len(latencies) * 0.95) - 1]
    assert p95 < 1000, {
        "p95_ms": p95,
        "max_ms": max(latencies),
        "count": len(latencies),
    }
    wait_for_distribution_answer_archives(timeout=5)


def test_distribution_answer_route_does_not_wait_for_archive_write(client, monkeypatch):
    from src.repositories import distribution_repo
    from src.routes.distribution import (
        distribution_states,
        init_distribution_state,
        wait_for_distribution_answer_archives,
    )

    saved = threading.Event()

    def slow_save_distribution_answer(**payload):
        time.sleep(0.3)
        saved.set()

    monkeypatch.setattr(distribution_repo, "save_distribution_answer", slow_save_distribution_answer)

    distribution_states.clear()
    init_distribution_state(
        captcha_id="slow-archive-captcha",
        event=None,
        usage_log_id=1,
        api_key_id=1,
        num_operators=2,
        icons_cache={position: {"image": f"image-{position}", "icon": f"icon-{position}"} for position in range(5)},
        captcha_data={"puzzle": {"imageBase64": "main", "iconsBase64": "icons"}},
    )

    start = time.perf_counter()
    response = client.post(
        "/distribution/answer",
        json={
            "captcha_id": "slow-archive-captcha",
            "operator_id": 1,
            "icon_position": 4,
            "x": 44,
            "y": 88,
        },
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert response.status_code == 200
    assert elapsed_ms < 150
    assert not saved.is_set()

    wait_for_distribution_answer_archives(timeout=5)
    assert saved.is_set()


def test_distribution_answer_lock_is_scoped_to_one_captcha():
    import asyncio

    from src.models import DistributionAnswerBody
    from src.routes.distribution import (
        distribution_states,
        handle_distribution_answer,
        init_distribution_state,
        wait_for_distribution_answer_archives,
    )

    distribution_states.clear()
    icons_cache = {
        position: {"image": f"image-{position}", "icon": f"icon-{position}"}
        for position in range(5)
    }
    for captcha_id in ("locked-captcha", "free-captcha"):
        init_distribution_state(
            captcha_id=captcha_id,
            event=None,
            usage_log_id=1,
            api_key_id=1,
            num_operators=2,
            icons_cache=icons_cache,
            captcha_data={"puzzle": {"imageBase64": "main", "iconsBase64": "icons"}},
        )

    async def answer_free_while_other_captcha_is_locked():
        locked_state = distribution_states["locked-captcha"]
        await locked_state["lock"].acquire()
        try:
            start = time.perf_counter()
            response = await asyncio.wait_for(
                handle_distribution_answer(
                    DistributionAnswerBody(
                        captcha_id="free-captcha",
                        operator_id=1,
                        icon_position=4,
                        x=44,
                        y=88,
                    )
                ),
                timeout=0.2,
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            return response, elapsed_ms
        finally:
            locked_state["lock"].release()

    response, elapsed_ms = asyncio.run(answer_free_while_other_captcha_is_locked())

    assert response.status_code == 200
    assert elapsed_ms < 150
    wait_for_distribution_answer_archives(timeout=5)


def test_distribution_answer_route_records_latency_breakdown(client):
    from src.platform.observability.metrics import reset_metrics, snapshot
    from src.routes.distribution import (
        distribution_states,
        init_distribution_state,
        wait_for_distribution_answer_archives,
    )

    reset_metrics()
    distribution_states.clear()
    init_distribution_state(
        captcha_id="metrics-captcha",
        event=None,
        usage_log_id=1,
        api_key_id=1,
        num_operators=2,
        icons_cache={position: {"image": f"image-{position}", "icon": f"icon-{position}"} for position in range(5)},
        captcha_data={"puzzle": {"imageBase64": "main", "iconsBase64": "icons"}},
    )

    response = client.post(
        "/distribution/answer",
        json={
            "captcha_id": "metrics-captcha",
            "operator_id": 1,
            "icon_position": 4,
            "x": 44,
            "y": 88,
        },
    )

    assert response.status_code == 200
    wait_for_distribution_answer_archives(timeout=5)
    metrics = snapshot()
    assert metrics["eopp_distribution_answer_total_ms_count"] == 1
    assert metrics["eopp_distribution_answer_lock_wait_ms_count"] == 1
    assert metrics["eopp_distribution_answer_state_ms_count"] == 1
    assert metrics["eopp_distribution_answer_sse_ms_count"] == 1
    assert metrics["eopp_distribution_answer_archive_submit_ms_count"] == 1
    assert metrics["eopp_distribution_answer_archive_save_ms_count"] == 1
