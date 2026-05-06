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


class TestWithdrawals:
    """Операции с выводами."""

    def test_create_withdrawal(self):
        """Создание вывода."""
        from src.db import create_withdrawal

        w = create_withdrawal(name="Test", percent=10, requisites="123456")
        assert w["name"] == "Test"
        assert w["percent"] == 10

    def test_list_withdrawals(self):
        """Список выводов."""
        from src.db import create_withdrawal, list_withdrawals

        create_withdrawal(name="W1", percent=5, requisites="r1")
        create_withdrawal(name="W2", percent=15, requisites="r2")
        withdrawals = list_withdrawals()
        assert len(withdrawals) >= 2

    def test_get_withdrawal(self):
        """Получение вывода."""
        from src.db import create_withdrawal, get_withdrawal

        w = create_withdrawal(name="GetTest", percent=20, requisites="get123")
        found = get_withdrawal(w["id"])
        assert found["name"] == "GetTest"

    def test_get_withdrawal_not_found(self):
        """Получение несуществующего вывода."""
        from src.db import get_withdrawal

        assert get_withdrawal(99999) is None

    def test_update_withdrawal(self):
        """Обновление вывода."""
        from src.db import create_withdrawal, update_withdrawal

        w = create_withdrawal(name="Original", percent=10, requisites="orig")
        updated = update_withdrawal(w["id"], name="Updated", percent=25)
        assert updated["name"] == "Updated"
        assert updated["percent"] == 25
        assert updated["requisites"] == "orig"

    def test_delete_withdrawal(self):
        """Удаление вывода."""
        from src.db import create_withdrawal, delete_withdrawal, list_withdrawals

        w = create_withdrawal(name="ToDelete", percent=10, requisites="del")
        assert delete_withdrawal(w["id"]) is True
        withdrawals = list_withdrawals()
        assert not any(x["id"] == w["id"] for x in withdrawals)


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
