from datetime import UTC, date, datetime

import pytest


def test_render_confirm_notification_contains_type_and_price():
    from src.services import telegram_service

    record = {
        "id": 42,
        "op_type": "reschedule",
        "price": 7000,
        "company": "ACME",
        "fio": "Ivan Ivanov",
        "vehicle_number": "A123BC",
        "slot_date": "2026-06-01",
        "is_test": False,
    }

    text = telegram_service.render_confirm_notification(record)

    assert "Подтверждено бронирование" in text
    assert "Тип: Перенос" in text
    assert "Цена: 7000 ₽" in text
    assert "ACME" in text
    assert "A123BC" in text


def test_notify_confirmed_usage_skips_test_records(monkeypatch):
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(
        telegram_service,
        "send_message_async",
        lambda text: sent.append(text) or True,
    )

    result = telegram_service.notify_confirmed_usage({"id": 1, "is_test": True})

    assert result is False
    assert sent == []


def test_notify_confirmed_usage_sends_real_records(monkeypatch):
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(
        telegram_service,
        "send_message_async",
        lambda text: sent.append(text) or True,
    )

    result = telegram_service.notify_confirmed_usage(
        {"id": 1, "is_test": False, "op_type": "create", "price": 1000}
    )

    assert result is True
    assert len(sent) == 1
    assert "Тип: Создание" in sent[0]
    assert "Цена: 1000 ₽" in sent[0]


def test_notify_usage_by_id_sends_existing_real_record(seeded_reporting_db, monkeypatch):
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(
        telegram_service,
        "send_message_async",
        lambda text: sent.append(text) or True,
    )

    result = telegram_service.notify_usage_by_id(seeded_reporting_db["real_usage_id"])

    assert result is True
    assert len(sent) == 1
    assert "ID лога:" in sent[0]
    assert "Тип: Создание" in sent[0]


def test_notify_usage_by_id_returns_false_for_missing_record(isolated_api_db):
    from src.services import telegram_service

    assert telegram_service.notify_usage_by_id(999999) is False


def test_send_daily_report_sync_uses_sync_sender(seeded_reporting_db, monkeypatch):
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(telegram_service, "_send_message_sync", lambda text: sent.append(text) or True)

    result = telegram_service.send_daily_report_sync(day=date(2026, 6, 1))

    assert result is True
    assert len(sent) == 1
    assert "📊 Итоги за день: 2026-06-01" in sent[0]


def test_confirm_usage_triggers_telegram_for_real_record(client, admin_token, monkeypatch):
    from src.db.usage_log import log_usage
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(telegram_service, "send_message_async", lambda text: sent.append(text))

    key_data = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "telegram_confirm_key"},
    ).json()
    client.put(
        f"/admin/tariffs/{key_data['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"price_create": 1000, "price_reschedule": 7000, "price_create_peak": None},
    )
    uid = log_usage(
        api_key=key_data["key"],
        reservation_id="real-reservation-telegram",
        captcha_id="unknown",
        config_json={"mode": "reschedule"},
    )

    response = client.post(
        "/confirm-usage", json={"api_key": key_data["key"], "usage_log_id": uid}
    )

    assert response.status_code == 200
    assert len(sent) == 1
    assert "Тип: Перенос" in sent[0]
    assert "Цена: 7000 ₽" in sent[0]


def test_confirm_usage_does_not_trigger_telegram_for_test_record(client, monkeypatch, api_key):
    from src.db.usage_log import log_usage
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(telegram_service, "send_message_async", lambda text: sent.append(text))
    uid = log_usage(
        api_key=api_key,
        reservation_id="00000000-0000-0000-0000-000000000000",
        captcha_id="unknown",
        config_json={"mode": "create", "runUpTo": 2},
    )

    response = client.post("/confirm-usage", json={"api_key": api_key, "usage_log_id": uid})

    assert response.status_code == 200
    assert sent == []


def test_daily_report_includes_operation_and_payment_breakdowns(seeded_reporting_db):
    from src.services import reporting_service

    report = reporting_service.build_daily_report(date(2026, 6, 1))

    assert report["operations"]["create"]["count"] == 1
    assert report["operations"]["create"]["revenue"] == 500
    assert report["operations"]["reschedule"]["count"] == 1
    assert report["operations"]["reschedule"]["revenue"] == 300
    assert report["payments"]["paid"]["count"] == 1
    assert report["payments"]["paid"]["revenue"] == 500
    assert report["payments"]["unpaid"]["count"] == 1
    assert report["payments"]["unpaid"]["revenue"] == 300


def test_render_daily_report_includes_breakdowns(seeded_reporting_db):
    from src.services import reporting_service

    text = reporting_service.render_telegram_daily_report(
        reporting_service.build_daily_report(date(2026, 6, 1))
    )

    assert "📊 Итоги за день: 2026-06-01" in text
    assert "💰 Сумма: 800 ₽" in text
    assert "🔧 По типам:" in text
    assert "Создание: 1 / 500 ₽" in text
    assert "Перенос: 1 / 300 ₽" in text
    assert "💳 По оплате:" not in text


def test_render_daily_report_omits_empty_lines_and_sections(seeded_reporting_db):
    from src.services import reporting_service

    text = reporting_service.render_telegram_daily_report(
        reporting_service.build_daily_report(date(2026, 6, 1))
    )

    assert "Без цены:" not in text
    assert "⏳ В ожидании:" not in text
    assert "❌ Ошибки:" not in text
    assert "💳 По оплате:" not in text

    empty = reporting_service.render_telegram_daily_report(
        {
            "date": "2026-06-02",
            "total": 0,
            "success_count": 0,
            "failed_count": 0,
            "pending_count": 0,
            "revenue_total": 0,
            "operations": {},
            "payments": {"paid": {"count": 0, "revenue": 0}},
            "companies": [],
        }
    )
    assert "🔧 По типам:" not in empty
    assert "🏢 По компаниям:" not in empty


def test_parse_report_day_accepts_iso_date():
    from src.services.telegram_service import parse_report_day

    assert parse_report_day("2026-06-01") == date(2026, 6, 1)


def test_parse_report_day_rejects_invalid_date():
    from src.services.telegram_service import parse_report_day

    with pytest.raises(ValueError):
        parse_report_day("01.06.2026")


def test_seconds_until_next_daily_run_uses_msk_1210():
    from src.services.telegram_service import seconds_until_next_daily_run

    now = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)  # 11:00 MSK

    assert seconds_until_next_daily_run(now) == 70 * 60


@pytest.fixture
def seeded_reporting_db(isolated_api_db):
    from src.db.usage_log import log_usage
    from src.entities import UsageLog, get_session
    from src.repositories import api_key_repo

    key = api_key_repo.create_key("telegram_report_key", max_uses=None)

    lid1 = log_usage(key.key, "res-1", "capt-1", {"mode": "create"})
    lid2 = log_usage(key.key, "res-2", "capt-2", {"mode": "reschedule"})
    lid3 = log_usage(key.key, "res-test", "capt-test", {"mode": "create", "runUpTo": 2})

    with get_session() as session:
        log = session.get(UsageLog, lid1)
        log.status = "confirmed"
        log.price = 500
        log.paid = True
        log.company = "CompanyA"
        log.is_test = False
        log.created_at = "2026-06-01T08:00:00+00:00"
        log.confirmed_at = "2026-06-01T08:01:00+00:00"

        log = session.get(UsageLog, lid2)
        log.status = "confirmed"
        log.price = 300
        log.paid = False
        log.company = "CompanyB"
        log.is_test = False
        log.created_at = "2026-06-01T09:00:00+00:00"
        log.confirmed_at = "2026-06-01T09:01:00+00:00"

        log = session.get(UsageLog, lid3)
        log.status = "confirmed"
        log.price = 900
        log.company = "TestCompany"
        log.is_test = True
        log.created_at = "2026-06-01T10:00:00+00:00"
        log.confirmed_at = "2026-06-01T10:01:00+00:00"
        session.commit()

    return {"key": key, "real_usage_id": lid1}
