from datetime import UTC, date, datetime

import pytest


def attach_api_key_to_company(api_key_id, company_id):
    from src.db.connection import get_connection

    conn = get_connection()
    conn.execute("UPDATE api_keys SET company_id = ? WHERE id = ?", (company_id, api_key_id))
    conn.commit()
    conn.close()


def create_company_with_tariff(name, tariff):
    from src.db.connection import get_connection

    now = datetime.now(UTC).isoformat()
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?)",
        (name, now, now),
    )
    company_id = cur.lastrowid
    conn.execute(
        """
        INSERT INTO company_tariffs (
            company_id, price_create, price_reschedule, price_create_peak,
            price_custom_slots, executor_amount, operator_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
        """,
        (
            company_id,
            tariff["price_create"],
            tariff["price_reschedule"],
            tariff.get("price_create_peak"),
            tariff.get("price_custom_slots"),
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return {"id": company_id, "name": name}


def create_api_key_for_company(label, company_id):
    from src.db import create_key

    key = create_key(label=label)
    attach_api_key_to_company(key["id"], company_id)
    return key


def create_login_api_key_for_company(client, admin_token, label, company_id):
    response = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": f"{label} owner",
            "login": f"{label}.owner",
            "password": "strong-password",
            "company_id": company_id,
        },
    )
    assert response.status_code == 200
    user_id = response.json()["id"]
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": label, "max_uses": 1000, "user_id": user_id},
    )
    assert key.status_code == 200
    key_data = key.json()
    attach_api_key_to_company(key_data["id"], company_id)
    return {**key_data, "login": f"{label}.owner", "password": "strong-password"}


def login_key_owner(client, key):
    from src.repositories import api_key_repo, user_repo

    record = api_key_repo.get_key_record(key)
    assert record is not None
    user = user_repo.get_user(record.user_id)
    assert user is not None
    response = client.post("/api/auth/login", json={"login": user["login"], "password": key})
    assert response.status_code == 200


def login_with_password(client, login, password):
    response = client.post("/api/auth/login", json={"login": login, "password": password})
    assert response.status_code == 200


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
    assert "1000" in sent[0]


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
    assert "ID" in sent[0]


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
    assert "2026-06-01" in sent[0]


def test_confirm_usage_does_not_trigger_telegram_synchronously(client, admin_token, monkeypatch):
    from src.db.usage_log import log_usage
    from src.services import telegram_service

    sent = []
    monkeypatch.setattr(telegram_service, "send_message_async", lambda text: sent.append(text))

    company = create_company_with_tariff(
        "Telegram Confirm Co",
        {"price_create": 1000, "price_reschedule": 7000, "price_create_peak": None},
    )
    key_data = create_login_api_key_for_company(
        client, admin_token, "telegram_confirm_key", company["id"]
    )
    uid = log_usage(
        api_key=key_data["key"],
        reservation_id="real-reservation-telegram",
        captcha_id="unknown",
        config_json={"mode": "reschedule"},
    )
    login_with_password(client, key_data["login"], key_data["password"])

    response = client.post(
        "/api/confirm-usage", json={"usage_log_id": uid}
    )

    assert response.status_code == 200
    assert sent == []


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

    response = client.post("/api/confirm-usage", json={"usage_log_id": uid})

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
