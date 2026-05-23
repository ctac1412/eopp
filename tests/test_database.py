"""
EOPP Captcha Solver - Database Unit Tests

Полный набор тестов БД:
- TestAPIKeysDB - CRUD операции с ключами
- TestValidateKey - валидация ключей
- TestUsageLog - логирование использования
- TestAdminKey - админский ключ
- TestEdgeCases - граничные случаи
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    """Изолируем БД для каждого теста."""
    import src.db.connection as conn_module
    import src.db.init as init_module

    test_db = tempfile.mktemp(suffix=".db")
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    init_module.init_db()

    yield

    try:
        conn_module.get_connection().close()
    except:
        pass
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except:
            pass


class TestAPIKeysDB:
    """CRUD операции с API ключами."""

    def test_create_key(self):
        """Создание ключа."""
        from src.db import create_key

        key = create_key(label="test", max_uses=10)
        assert key["label"] == "test"
        assert key["max_uses"] == 10
        assert key["active"] is True
        assert "key" in key

    def test_list_keys(self):
        """Список ключей."""
        from src.db import create_key, list_keys

        create_key(label="key1")
        create_key(label="key2")
        keys = list_keys()
        assert len(keys) >= 2

    def test_update_key(self):
        """Обновление ключа."""
        from src.db import create_key, update_key

        key = create_key(label="original")
        updated = update_key(key["id"], label="updated", active=False)
        assert updated["label"] == "updated"
        assert updated["active"] is False

    def test_update_key_comment(self):
        """Обновление комментария."""
        from src.db import create_key, update_key

        key = create_key(label="comment_test")
        updated = update_key(key["id"], comment="Test comment")
        assert updated["comment"] == "Test comment"

    def test_delete_key(self):
        """Удаление ключа."""
        from src.db import create_key, delete_key, list_keys

        key = create_key(label="to_delete")
        assert delete_key(key["id"]) is True
        keys = list_keys()
        assert not any(k["id"] == key["id"] for k in keys)

    def test_get_key_by_id(self):
        """Получение ключа по ID."""
        from src.db import create_key, get_key_by_id

        key = create_key(label="lookup")
        found = get_key_by_id(key["id"])
        assert found["label"] == "lookup"

    def test_get_key_by_id_not_found(self):
        """Получение несуществующего ключа."""
        from src.db import get_key_by_id

        assert get_key_by_id(99999) is None


class TestValidateKey:
    """Валидация ключей."""

    def test_validate_valid_key(self):
        """Валидация валидного ключа."""
        from src.db import create_key, validate_key

        key = create_key(label="valid")
        result = validate_key(key["key"])
        assert result["valid"] is True

    def test_validate_invalid_key(self):
        """Валидация несуществующего ключа."""
        from src.db import validate_key

        result = validate_key("nonexistent")
        assert result["valid"] is False
        assert result["reason"] == "Key not found"

    def test_validate_disabled_key(self):
        """Валидация отключенного ключа."""
        from src.db import create_key, update_key, validate_key

        key = create_key(label="disabled")
        update_key(key["id"], active=False)
        result = validate_key(key["key"])
        assert result["valid"] is False
        assert result["reason"] == "Key is disabled"

    def test_validate_exhausted_key(self):
        """Валидация ключа с исчерпанным лимитом."""
        from src.db import create_key, update_key, validate_key

        key = create_key(label="exhausted", max_uses=1)
        update_key(key["id"])
        from src.db import get_connection

        conn = get_connection()
        conn.execute("UPDATE api_keys SET usage_count = 1 WHERE id = ?", (key["id"],))
        conn.commit()
        conn.close()
        result = validate_key(key["key"])
        assert result["valid"] is False
        assert result["reason"] == "Maximum uses exceeded"


class TestUsageLog:
    """Логирование использования."""

    def test_log_usage(self):
        """Регистрация использования."""
        from src.db import create_key, log_usage

        key = create_key(label="usage_test")
        log_id = log_usage(key["key"], "res-123", "capt-123")
        assert log_id > 0

    def test_confirm_usage(self):
        """Подтверждение использования."""
        from src.db import confirm_usage, create_key, log_usage

        key = create_key(label="confirm_test")
        log_id = log_usage(key["key"], "res-conf", "capt-conf")
        assert confirm_usage(log_id) is True

    def test_confirm_usage_with_price(self):
        """Подтверждение с ценой из тарифа."""
        from src.db import (
            confirm_usage,
            create_key,
            create_tariff,
            get_usage_log_entry,
            log_usage,
        )

        key = create_key(label="price_test")
        create_tariff(key["id"], price_create=100, price_reschedule=50)
        log_id = log_usage(
            key["key"], "res-price", "capt-price", config_json={"mode": "create"}
        )
        confirm_usage(log_id)
        log = get_usage_log_entry(log_id)
        assert log["price"] == 100

    def test_confirm_usage_reschedule_price(self):
        """Подтверждение переноса с ценой."""
        from src.db import (
            confirm_usage,
            create_key,
            create_tariff,
            get_usage_log_entry,
            log_usage,
        )

        key = create_key(label="reschedule_price")
        create_tariff(key["id"], price_create=100, price_reschedule=75)
        log_id = log_usage(
            key["key"], "res-resched", "capt-resched", config_json={"mode": "reschedule"}
        )
        confirm_usage(log_id)
        log = get_usage_log_entry(log_id)
        assert log["price"] == 75

    def test_confirm_usage_links_company_to_open_invoice(self):
        """Подтвержденный usage компании автоматически попадает в открытый счет."""
        from src.db import confirm_usage, create_key, create_tariff, get_usage_log_entry, log_usage
        from src.db.invoices import get_open_invoice

        key = create_key(label="open_invoice_link")
        create_tariff(key["id"], price_create=100, price_reschedule=70)
        log_id = log_usage(
            key["key"],
            "res-open-link",
            "capt-open-link",
            config_json={
                "mode": "create",
                "reservationData": {"raw": {"userData": {"organizationName": "ООО Тест Компания"}}},
            },
        )

        assert confirm_usage(log_id) is True
        log = get_usage_log_entry(log_id)
        assert log["invoice_id"] is not None
        open_invoice = get_open_invoice("ООО Тест Компания")
        assert open_invoice is not None
        assert log["invoice_id"] == open_invoice["id"]
        assert open_invoice["is_open"] is True

    def test_fail_usage(self):
        """Отметка ошибки."""
        from src.db import create_key, fail_usage, log_usage

        key = create_key(label="fail_test")
        log_id = log_usage(key["key"], "res-fail", "capt-fail")
        assert (
            fail_usage(log_id, error_message="Test error", error_stage="captcha") is True
        )

    def test_update_usage_log(self):
        """Обновление лога."""
        from src.db import create_key, log_usage, update_usage_log

        key = create_key(label="update_log")
        log_id = log_usage(key["key"], "res-update", "capt-update")
        updated = update_usage_log(log_id, price=500, paid=True)
        assert updated["price"] == 500
        assert updated["paid"] is True

    def test_list_usages(self):
        """Список логов."""
        from src.db import create_key, list_usages, log_usage

        key = create_key(label="list_test")
        log_usage(key["key"], "res-1", "capt-1")
        log_usage(key["key"], "res-2", "capt-2")
        usages = list_usages()
        assert len(usages) >= 2


class TestTariffs:
    """Операции с тарифами."""

    def test_create_tariff(self):
        """Создание тарифа."""
        from src.db import create_key, create_tariff

        key = create_key(label="tariff_test")
        tariff = create_tariff(key["id"], price_create=100, price_reschedule=50)
        assert tariff["price_create"] == 100
        assert tariff["price_reschedule"] == 50

    def test_get_tariff(self):
        """Получение тарифа."""
        from src.db import create_key, create_tariff, get_tariff

        key = create_key(label="get_tariff")
        create_tariff(key["id"], price_create=200, price_reschedule=100)
        tariff = get_tariff(key["id"])
        assert tariff["price_create"] == 200

    def test_get_tariff_not_found(self):
        """Получение несуществующего тарифа."""
        from src.db import create_key, get_tariff

        key = create_key(label="no_tariff")
        assert get_tariff(key["id"]) is None

    def test_update_tariff(self):
        """Обновление тарифа."""
        from src.db import create_key, create_tariff, update_tariff

        key = create_key(label="update_tariff")
        create_tariff(key["id"], price_create=100, price_reschedule=50)
        updated = update_tariff(key["id"], price_create=150)
        assert updated["price_create"] == 150
        assert updated["price_reschedule"] == 50

    def test_delete_tariff(self):
        """Удаление тарифа."""
        from src.db import create_key, create_tariff, delete_tariff, get_tariff

        key = create_key(label="delete_tariff")
        create_tariff(key["id"], price_create=100, price_reschedule=50)
        assert delete_tariff(key["id"]) is True
        assert get_tariff(key["id"]) is None


class TestAdminKey:
    """Админский ключ."""

    def test_admin_key_exists(self):
        """Админский ключ существует."""
        from src.db import get_key_by_label

        admin = get_key_by_label("admin")
        assert admin is not None

    def test_admin_key_active(self):
        """Админский ключ активен."""
        from src.db import get_key_by_label

        admin = get_key_by_label("admin")
        assert admin["active"] is True


class TestEdgeCases:
    """Граничные случаи."""

    def test_empty_label(self):
        """Ключ с пустым лейблом."""
        from src.db import create_key

        key = create_key(label="")
        assert key["label"] == ""

    def test_max_uses_none(self):
        """Ключ без лимита."""
        from src.db import create_key, validate_key

        key = create_key(label="unlimited", max_uses=None)
        result = validate_key(key["key"])
        assert result["valid"] is True
        assert result["remaining"] is None

    def test_usage_increment(self):
        """Инкремент счётчика использования."""
        from src.db import confirm_usage, create_key, increment_usage, log_usage

        key = create_key(label="increment")
        log_id = log_usage(key["key"], "res-inc", "capt-inc")
        assert increment_usage(key["key"]) is True
        confirm_usage(log_id)
        from src.db import get_key_by_id

        updated = get_key_by_id(key["id"])
        assert updated["usage_count"] >= 1

    def test_get_key_by_label_not_found(self):
        """Получение ключа по несуществующему лейблу."""
        from src.db import get_key_by_label

        assert get_key_by_label("nonexistent_label") is None

    def test_delete_nonexistent_key(self):
        """Удаление несуществующего ключа."""
        from src.db import delete_key

        assert delete_key(99999) is False

    def test_confirm_nonexistent_usage(self):
        """Подтверждение несуществующего использования."""
        from src.db import confirm_usage

        assert confirm_usage(99999) is False

    def test_fail_nonexistent_usage(self):
        """Отметка несуществующего использования."""
        from src.db import fail_usage

        assert (
            fail_usage(99999, error_message="Error", error_stage="test") is False
        )


class TestOpenInvoices:
    """Открытые счета по компаниям."""

    def test_issue_open_invoice_closes_current_and_creates_new(self):
        from src.db import create_key, create_tariff, confirm_usage, log_usage
        from src.db.invoices import get_open_invoice, issue_open_invoice

        key = create_key(label="open_issue")
        create_tariff(key["id"], price_create=120, price_reschedule=90)
        for idx in range(2):
            log_id = log_usage(
                key["key"],
                f"res-open-{idx}",
                f"capt-open-{idx}",
                config_json={
                    "mode": "create",
                    "reservationData": {"raw": {"userData": {"organizationName": "ООО Issue"}}},
                },
            )
            confirm_usage(log_id)

        old_open = get_open_invoice("ООО Issue")
        assert old_open is not None
        result = issue_open_invoice("ООО Issue")
        assert result is not None
        assert result["closed_invoice"]["id"] == old_open["id"]
        assert result["closed_invoice"]["is_open"] is False
        assert result["closed_invoice"]["debt_amount"] == 240
        assert result["new_open_invoice"]["id"] != old_open["id"]
        assert result["new_open_invoice"]["is_open"] is True


class TestPrepaidPackages:
    """Предоплаченные пакеты и списания."""

    def test_prepaid_deduction_on_confirm_usage(self):
        from src.db import create_key, create_tariff, get_usage_log_entry, log_usage, confirm_usage
        from src.db.prepaid import create_prepaid_package, list_prepaid_packages

        key = create_key(label="prepaid")
        create_tariff(key["id"], price_create=100, price_reschedule=70)
        create_prepaid_package(api_key_id=key["id"], balance_amount=500, active=True)

        log_id = log_usage(
            key["key"],
            "res-prepaid",
            "capt-prepaid",
            config_json={"mode": "create"},
        )
        confirm_usage(log_id)

        log = get_usage_log_entry(log_id)
        packages = list_prepaid_packages()
        pkg = next(item for item in packages if item["api_key_id"] == key["id"])
        assert log["paid"] is True
        assert pkg["balance_amount"] == 400

    def test_prepaid_not_deducted_when_insufficient_balance(self):
        from src.db import create_key, create_tariff, get_usage_log_entry, log_usage, confirm_usage
        from src.db.prepaid import create_prepaid_package, list_prepaid_packages

        key = create_key(label="prepaid_low")
        create_tariff(key["id"], price_create=200, price_reschedule=70)
        create_prepaid_package(api_key_id=key["id"], balance_amount=100, active=True)

        log_id = log_usage(
            key["key"],
            "res-prepaid-low",
            "capt-prepaid-low",
            config_json={"mode": "create"},
        )
        confirm_usage(log_id)

        log = get_usage_log_entry(log_id)
        packages = list_prepaid_packages()
        pkg = next(item for item in packages if item["api_key_id"] == key["id"])
        assert log["paid"] is None
        assert pkg["balance_amount"] == 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
