"""Tests for reporting_service — daily report builder."""

import os
import sys
import tempfile
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from src.services import reporting_service


@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    import src.db.connection as conn_module
    import src.db.init as init_module
    from src.entities.base import set_db_path

    test_db = tempfile.mktemp(suffix=".db")
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    set_db_path(test_db)
    init_module.init_db()

    yield

    try:
        conn_module.get_connection().close()
    except Exception:
        pass
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except Exception:
            pass


@pytest.fixture
def seeded_db(isolate_db):
    """Create an API key and usage logs for testing reports."""
    from src.repositories import api_key_repo

    key = api_key_repo.create_key("report_test_key", max_uses=None)

    from src.db.usage_log import log_usage
    from src.entities import UsageLog, get_session

    today = date.today()
    today_iso = today.isoformat()

    # Create confirmed usage with price
    lid1 = log_usage(key.key, "res-1", "capt-1", {"mode": "create"})
    with get_session() as session:
        log = session.get(UsageLog, lid1)
        log.status = "confirmed"
        log.price = 500
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T10:00:00+00:00"
        log.confirmed_at = f"{today_iso}T10:01:00+00:00"
        session.commit()

    # Create another confirmed usage for same company
    lid2 = log_usage(key.key, "res-2", "capt-2", {"mode": "reschedule"})
    with get_session() as session:
        log = session.get(UsageLog, lid2)
        log.status = "confirmed"
        log.price = 300
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T11:00:00+00:00"
        log.confirmed_at = f"{today_iso}T11:01:00+00:00"
        session.commit()

    # Create a failed usage
    lid3 = log_usage(key.key, "res-3", "capt-3", {"mode": "create"})
    with get_session() as session:
        log = session.get(UsageLog, lid3)
        log.status = "failed"
        log.company = "CompanyB"
        log.is_test = False
        log.created_at = f"{today_iso}T12:00:00+00:00"
        session.commit()

    # Create a pending usage
    lid4 = log_usage(key.key, "res-4", "capt-4", {"mode": "create"})
    with get_session() as session:
        log = session.get(UsageLog, lid4)
        log.status = "pending"
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T13:00:00+00:00"
        session.commit()

    # Create a test usage (should be filtered out)
    lid5 = log_usage(key.key, "res-5", "capt-5", {"mode": "create", "runUpTo": 2})
    with get_session() as session:
        log = session.get(UsageLog, lid5)
        log.status = "confirmed"
        log.price = 100
        log.company = "CompanyA"
        log.is_test = True
        log.created_at = f"{today_iso}T14:00:00+00:00"
        log.confirmed_at = f"{today_iso}T14:01:00+00:00"
        session.commit()

    return key


def test_build_daily_report_counts(seeded_db):
    """build_daily_report returns correct counts excluding test entries."""
    report = reporting_service.build_daily_report()
    assert report["total"] == 4  # 4 non-test entries
    assert report["success_count"] == 2
    assert report["failed_count"] == 1
    assert report["pending_count"] == 1
    assert report["revenue_total"] == 800  # 500 + 300


def test_build_daily_report_companies(seeded_db):
    """Company breakdown is correct."""
    report = reporting_service.build_daily_report()
    companies = {c["company"]: c for c in report["companies"]}
    assert "CompanyA" in companies
    assert companies["CompanyA"]["success"] == 2
    assert companies["CompanyA"]["revenue"] == 800
    assert companies["CompanyA"]["failed"] == 0
    assert companies["CompanyA"]["pending"] == 1

    assert "CompanyB" in companies
    assert companies["CompanyB"]["failed"] == 1
    assert companies["CompanyB"]["success"] == 0


def test_build_daily_report_filters_by_day(seeded_db):
    """Only entries from the given day are included."""
    yesterday = date(2020, 1, 1)
    report = reporting_service.build_daily_report(yesterday)
    assert report["total"] == 0


def test_render_telegram_daily_report(seeded_db):
    """Telegram report contains expected sections."""
    report = reporting_service.build_daily_report()
    text = reporting_service.render_telegram_daily_report(report)
    assert "Daily report" in text
    assert "Total: 4" in text
    assert "Success: 2" in text
    assert "Failed: 1" in text
    assert "Pending: 1" in text
    assert "Revenue: 800 RUB" in text
    assert "CompanyA" in text
    assert "CompanyB" in text


def test_render_empty_report():
    """Empty report renders without error."""
    report = {
        "date": "2026-01-01",
        "total": 0,
        "success_count": 0,
        "failed_count": 0,
        "pending_count": 0,
        "revenue_total": 0,
        "companies": [],
    }
    text = reporting_service.render_telegram_daily_report(report)
    assert "no records" in text


def test_telegram_command_preview_status(seeded_db):
    """/status command returns correct text."""
    result = reporting_service.telegram_command_preview("/status")
    assert "Status:" in result["text"]
    assert "total 4" in result["text"]


def test_telegram_command_preview_today(seeded_db):
    """/today command returns daily report."""
    result = reporting_service.telegram_command_preview("/today")
    assert "Daily report" in result["text"]


def test_telegram_command_preview_company(seeded_db):
    """/company command shows company breakdown."""
    result = reporting_service.telegram_command_preview("/company CompanyA")
    assert "CompanyA" in result["text"]
    assert "ok 2" in result["text"]


def test_telegram_command_preview_company_not_found(seeded_db):
    """Unknown company returns not found message."""
    result = reporting_service.telegram_command_preview("/company NoSuchCo")
    assert "not found" in result["text"]


def test_telegram_command_unknown(seeded_db):
    """Unknown command returns help text."""
    result = reporting_service.telegram_command_preview("/bogus")
    assert "Unknown command" in result["text"]


def test_company_totals_empty():
    """Empty entries list returns empty companies."""
    from src.services.reporting_service import _company_totals

    assert _company_totals([]) == []


def test_msk_day_bounds_yields_utc(seeded_db):
    """_msk_day_bounds returns UTC start/end for a MSK day."""
    from src.services.reporting_service import _msk_day_bounds

    target = date(2026, 6, 1)
    start, end = _msk_day_bounds(target)
    assert start.hour == 21  # June 1 00:00 MSK = May 31 21:00 UTC
    assert end.month == 6
    assert end.day == 1
    assert end.hour == 21  # June 2 00:00 MSK = June 1 21:00 UTC
