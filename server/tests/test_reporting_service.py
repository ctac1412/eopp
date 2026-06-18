"""Tests for reporting_service daily report builder."""

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db_template import cleanup_db_file, use_isolated_migrated_db
from src.services import reporting_service


@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    test_db = use_isolated_migrated_db(monkeypatch)

    yield

    cleanup_db_file(test_db)


@pytest.fixture
def seeded_db(isolate_db):
    from src.db.usage_log import log_usage
    from src.entities import UsageLog, get_session
    from src.repositories import api_key_repo

    key = api_key_repo.create_key("report_test_key", max_uses=None)
    today_iso = date.today().isoformat()

    lid1 = log_usage(key.key, "res-1", "capt-1", {"mode": "create"})
    lid2 = log_usage(key.key, "res-2", "capt-2", {"mode": "reschedule"})
    lid3 = log_usage(key.key, "res-3", "capt-3", {"mode": "create"})
    lid4 = log_usage(key.key, "res-4", "capt-4", {"mode": "create"})
    lid5 = log_usage(key.key, "res-5", "capt-5", {"mode": "create", "runUpTo": 2})

    with get_session() as session:
        log = session.get(UsageLog, lid1)
        log.status = "confirmed"
        log.price = 500
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T10:00:00+00:00"
        log.confirmed_at = f"{today_iso}T10:01:00+00:00"

        log = session.get(UsageLog, lid2)
        log.status = "confirmed"
        log.price = 300
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T11:00:00+00:00"
        log.confirmed_at = f"{today_iso}T11:01:00+00:00"

        log = session.get(UsageLog, lid3)
        log.status = "failed"
        log.company = "CompanyB"
        log.is_test = False
        log.created_at = f"{today_iso}T12:00:00+00:00"

        log = session.get(UsageLog, lid4)
        log.status = "pending"
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = f"{today_iso}T13:00:00+00:00"

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
    report = reporting_service.build_daily_report()
    assert report["total"] == 4
    assert report["success_count"] == 2
    assert report["failed_count"] == 1
    assert report["pending_count"] == 1
    assert report["revenue_total"] == 800


def test_build_daily_report_companies(seeded_db):
    report = reporting_service.build_daily_report()
    companies = {c["company"]: c for c in report["companies"]}
    assert companies["CompanyA"]["success"] == 2
    assert companies["CompanyA"]["revenue"] == 800
    assert companies["CompanyA"]["failed"] == 0
    assert companies["CompanyA"]["pending"] == 1
    assert companies["CompanyB"]["failed"] == 1
    assert companies["CompanyB"]["success"] == 0


def test_build_daily_report_filters_by_day(seeded_db):
    report = reporting_service.build_daily_report(date(2020, 1, 1))
    assert report["total"] == 0


def test_render_telegram_daily_report(seeded_db):
    report = reporting_service.build_daily_report()
    text = reporting_service.render_telegram_daily_report(report)
    assert "📊 Итоги за день" in text
    assert "📌 Всего запусков: 4" in text
    assert "✅ Успешно: 2" in text
    assert "❌ Ошибки: 1" in text
    assert "⏳ В ожидании: 1" in text
    assert "💰 Сумма: 800 ₽" in text
    assert "CompanyA" in text
    assert "CompanyB" in text


def test_render_empty_report():
    report = {
        "date": "2026-01-01",
        "total": 0,
        "success_count": 0,
        "failed_count": 0,
        "pending_count": 0,
        "revenue_total": 0,
        "operations": {},
        "payments": {},
        "companies": [],
    }
    text = reporting_service.render_telegram_daily_report(report)
    assert "🔧 По типам:" not in text
    assert "💳 По оплате:" not in text
    assert "🏢 По компаниям:" not in text


def test_telegram_command_preview_status(seeded_db):
    result = reporting_service.telegram_command_preview("/status")
    assert "Status:" in result["text"]
    assert "total 4" in result["text"]


def test_telegram_command_preview_today(seeded_db):
    result = reporting_service.telegram_command_preview("/today")
    assert "📊 Итоги за день" in result["text"]


def test_telegram_command_preview_company(seeded_db):
    result = reporting_service.telegram_command_preview("/company CompanyA")
    assert "CompanyA" in result["text"]
    assert "ok 2" in result["text"]


def test_telegram_command_preview_company_not_found(seeded_db):
    result = reporting_service.telegram_command_preview("/company NoSuchCo")
    assert "not found" in result["text"]


def test_telegram_command_unknown(seeded_db):
    result = reporting_service.telegram_command_preview("/bogus")
    assert "Unknown command" in result["text"]


def test_company_totals_empty():
    from src.services.reporting_service import _company_totals

    assert _company_totals([]) == []


def test_msk_day_bounds_yields_utc(seeded_db):
    from src.services.reporting_service import _msk_day_bounds

    start, end = _msk_day_bounds(date(2026, 6, 1))
    assert start.hour == 21
    assert end.month == 6
    assert end.day == 1
    assert end.hour == 21
