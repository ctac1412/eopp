"""Test run and test run result repository."""

import json
from datetime import UTC, datetime

from sqlalchemy import func

from src.entities import TestRun, TestRunResult, CaptchaFile, get_session


def create_test_run(
    course_id: int,
    participant_type: str,
    participant_id: int,
    interval_min: float = 2.0,
    interval_max: float = 7.0,
) -> dict:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        tr = TestRun(
            course_id=course_id,
            participant_type=participant_type,
            participant_id=participant_id,
            status="running",
            interval_min=interval_min,
            interval_max=interval_max,
            started_at=now,
            completed_at=None,
            created_at=now,
        )
        session.add(tr)
        session.flush()
        session.commit()
        return {
            "id": tr.id,
            "course_id": tr.course_id,
            "participant_type": tr.participant_type,
            "participant_id": tr.participant_id,
            "status": tr.status,
            "started_at": tr.started_at,
        }


def get_test_run(test_run_id: int) -> dict | None:
    with get_session() as session:
        tr = session.get(TestRun, test_run_id)
        if not tr:
            return None
        return _tr_to_dict(tr)


def complete_test_run(test_run_id: int) -> bool:
    with get_session() as session:
        tr = session.get(TestRun, test_run_id)
        if not tr:
            return False
        tr.status = "completed"
        tr.completed_at = datetime.now(UTC).isoformat()
        session.commit()
        return True


def cancel_test_run(test_run_id: int) -> bool:
    with get_session() as session:
        tr = session.get(TestRun, test_run_id)
        if not tr:
            return False
        tr.status = "cancelled"
        tr.completed_at = datetime.now(UTC).isoformat()
        session.commit()
        return True


def list_test_runs(
    participant_type: str | None = None,
    participant_id: int | None = None,
    limit: int = 20,
) -> list[dict]:
    with get_session() as session:
        q = session.query(TestRun)
        if participant_type:
            q = q.filter(TestRun.participant_type == participant_type)
        if participant_id is not None:
            q = q.filter(TestRun.participant_id == participant_id)
        runs = q.order_by(TestRun.created_at.desc()).limit(limit).all()
        return [_tr_to_dict(tr) for tr in runs]


def save_test_result(
    test_run_id: int,
    captcha_file_id: int,
    captcha_id: str,
    status: str = "pending",
    variant_index: int | None = None,
    duration_ms: int | None = None,
    icon_times: list[dict] | None = None,
) -> dict:
    with get_session() as session:
        result = TestRunResult(
            test_run_id=test_run_id,
            captcha_file_id=captcha_file_id,
            captcha_id=captcha_id,
            status=status,
            variant_index=variant_index,
            duration_ms=duration_ms,
            icon_times=json.dumps(icon_times) if icon_times else None,
            created_at=datetime.now(UTC).isoformat(),
        )
        session.add(result)
        session.flush()
        session.commit()
        return {"id": result.id, "status": result.status}


def get_test_run_results(test_run_id: int) -> list[dict]:
    with get_session() as session:
        results = (
            session.query(TestRunResult, CaptchaFile)
            .join(CaptchaFile, CaptchaFile.id == TestRunResult.captcha_file_id)
            .filter(TestRunResult.test_run_id == test_run_id)
            .order_by(TestRunResult.created_at.asc())
            .all()
        )
        return [
            {
                "id": r.id,
                "test_run_id": r.test_run_id,
                "captcha_file_id": r.captcha_file_id,
                "captcha_id": r.captcha_id,
                "status": r.status,
                "variant_index": r.variant_index,
                "duration_ms": r.duration_ms,
                "icon_times": json.loads(r.icon_times) if r.icon_times else None,
                "captcha_type": int(cf.captcha_type) if cf.captcha_type is not None and cf.captcha_type.isdigit() else None,
                "valid_index": cf.valid_index,
                "created_at": r.created_at,
            }
            for r, cf in results
        ]


def get_test_run_stats(test_run_id: int) -> dict:
    with get_session() as session:
        results = (
            session.query(TestRunResult)
            .filter(TestRunResult.test_run_id == test_run_id)
            .all()
        )
        total = len(results)
        if total == 0:
            return {"total": 0, "correct": 0, "incorrect": 0, "avg_duration_ms": None, "avg_icon_ms": None}

        correct = sum(1 for r in results if r.status == "correct")
        incorrect = sum(1 for r in results if r.status == "incorrect")
        durations = [r.duration_ms for r in results if r.duration_ms is not None]
        avg_duration = sum(durations) // len(durations) if durations else None

        all_icon_times = []
        for r in results:
            if r.icon_times:
                try:
                    it = json.loads(r.icon_times)
                    for entry in it:
                        if isinstance(entry, dict) and entry.get("duration_ms"):
                            all_icon_times.append(entry["duration_ms"])
                except (json.JSONDecodeError, TypeError):
                    pass
        avg_icon = sum(all_icon_times) // len(all_icon_times) if all_icon_times else None

        return {
            "total": total,
            "correct": correct,
            "incorrect": incorrect,
            "timeout": sum(1 for r in results if r.status == "timeout"),
            "avg_duration_ms": avg_duration,
            "avg_icon_ms": avg_icon,
        }


def get_participant_stats(participant_type: str, participant_id: int) -> list[dict]:
    """Return trends: list of test runs with aggregated stats for a participant."""
    with get_session() as session:
        runs = (
            session.query(TestRun)
            .filter(
                TestRun.participant_type == participant_type,
                TestRun.participant_id == participant_id,
                TestRun.status == "completed",
            )
            .order_by(TestRun.created_at.asc())
            .all()
        )
        trend = []
        for tr in runs:
            stats = get_test_run_stats(tr.id)
            trend.append({
                "test_run_id": tr.id,
                "course_id": tr.course_id,
                "started_at": tr.started_at,
                "completed_at": tr.completed_at,
                **stats,
            })
        return trend


def _tr_to_dict(tr: TestRun) -> dict:
    return {
        "id": tr.id,
        "course_id": tr.course_id,
        "participant_type": tr.participant_type,
        "participant_id": tr.participant_id,
        "status": tr.status,
        "interval_min": tr.interval_min,
        "interval_max": tr.interval_max,
        "started_at": tr.started_at,
        "completed_at": tr.completed_at,
        "created_at": tr.created_at,
    }
