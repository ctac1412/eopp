"""
EOPP Captcha Solver - Database Unit Tests

Тесты для SQLite базы данных API ключей.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import tempfile


@pytest.fixture(autouse=True)
def mock_db_path(monkeypatch):
    """Перенаправляем БД в уникальный временный файл для каждого теста."""
    import src.api_keys as api_keys_module
    import src.api_keys as keys_module

    # Создаём уникальный путь для каждого теста
    test_db = tempfile.mktemp(suffix=".db")

    monkeypatch.setattr(api_keys_module, "DB_PATH", test_db)
    keys_module.init_db()

    yield

    # cleanup - закрываем все соединения и удаляем
    keys_module.get_connection().close()
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except PermissionError:
            pass


class TestAPIKeysDB:
    """Тесты CRUD операций с API ключами."""

    def test_create_key(self):
        """Создание ключа."""
        from src.api_keys import create_key

        record = create_key("test_label", max_uses=100)
        assert record["label"] == "test_label"
        assert record["max_uses"] == 100
        assert record["active"] is True
        assert "key" in record

    def test_create_key_without_limit(self):
        """Создание ключа без лимита."""
        from src.api_keys import create_key

        record = create_key("unlimited_key")
        assert record["max_uses"] is None

    def test_list_keys(self):
        """Список ключей."""
        from src.api_keys import create_key, list_keys

        create_key("key1")
        create_key("key2")

        keys = list_keys()
        assert len(keys) >= 2
        assert any(k["label"] == "key1" for k in keys)

    def test_get_key_by_id(self):
        """Получение ключа по ID."""
        from src.api_keys import create_key, get_key_by_id

        created = create_key("by_id_test")
        retrieved = get_key_by_id(created["id"])

        assert retrieved is not None
        assert retrieved["label"] == "by_id_test"

    def test_get_key_by_id_not_found(self):
        """Получение несуществующего ключа."""
        from src.api_keys import get_key_by_id

        result = get_key_by_id(99999)
        assert result is None

    def test_update_key_label(self):
        """Обновление label."""
        from src.api_keys import create_key, update_key

        created = create_key("old_label")
        updated = update_key(created["id"], label="new_label")

        assert updated["label"] == "new_label"

    def test_update_key_max_uses(self):
        """Обновление лимита."""
        from src.api_keys import create_key, update_key

        created = create_key("limit_test", max_uses=10)
        updated = update_key(created["id"], max_uses=50)

        assert updated["max_uses"] == 50

    def test_update_key_active(self):
        """Обновление active статуса."""
        from src.api_keys import create_key, update_key

        created = create_key("active_test")
        updated = update_key(created["id"], active=False)

        assert updated["active"] is False

    def test_delete_key(self):
        """Удаление ключа."""
        from src.api_keys import create_key, delete_key, get_key_by_id

        created = create_key("to_delete")
        key_id = created["id"]

        result = delete_key(key_id)
        assert result is True

        assert get_key_by_id(key_id) is None

    def test_delete_key_not_found(self):
        """Удаление несуществующего ключа."""
        from src.api_keys import delete_key

        result = delete_key(99999)
        assert result is False

    def test_reset_usage(self):
        """Сброс счётчика использования."""
        from src.api_keys import create_key, increment_usage, reset_usage

        created = create_key("reset_test")
        key_id = created["id"]

        # Увеличиваем счётчик
        increment_usage(created["key"])
        increment_usage(created["key"])

        # Сбрасываем
        reset_usage(key_id)

        # Проверяем
        from src.api_keys import get_key_by_id

        key = get_key_by_id(key_id)
        assert key["usage_count"] == 0


class TestValidateKey:
    """Тесты валидации ключей."""

    def test_validate_valid_key(self):
        """Валидация активного ключа."""
        from src.api_keys import create_key, validate_key

        created = create_key("valid_test")
        result = validate_key(created["key"])

        assert result["valid"] is True
        assert result["label"] == "valid_test"

    def test_validate_key_not_found(self):
        """Валидация несуществующего ключа."""
        from src.api_keys import validate_key

        result = validate_key("nonexistent_key_123")
        assert result["valid"] is False
        assert result["reason"] == "Key not found"

    def test_validate_disabled_key(self):
        """Валидация отключённого ключа."""
        from src.api_keys import create_key, update_key, validate_key

        created = create_key("disabled_test")
        update_key(created["id"], active=False)

        result = validate_key(created["key"])
        assert result["valid"] is False
        assert result["reason"] == "Key is disabled"

    def test_validate_key_at_limit(self):
        """Валидация ключа на пределе лимита."""
        from src.api_keys import create_key, validate_key

        created = create_key("limit_test", max_uses=1)
        # Используем ключ
        from src.api_keys import increment_usage

        increment_usage(created["key"])

        result = validate_key(created["key"])
        assert result["valid"] is False
        assert result["reason"] == "Maximum uses exceeded"

    def test_validate_key_with_remaining(self):
        """Валидация возвращает remaining."""
        from src.api_keys import create_key, validate_key

        created = create_key("remaining_test", max_uses=10)
        result = validate_key(created["key"])

        assert result["remaining"] == 10

    def test_validate_unlimited_key(self):
        """Валидация ключа без лимита."""
        from src.api_keys import create_key, validate_key

        created = create_key("unlimited")
        result = validate_key(created["key"])

        assert result["remaining"] is None


class TestUsageLog:
    """Тесты логирования использования."""

    def test_log_usage(self):
        """Логирование использования."""
        from src.api_keys import create_key, log_usage

        key = create_key("log_test")
        usage_id = log_usage(key["key"], "reservation-123", "captcha-456")

        assert usage_id is not None
        assert isinstance(usage_id, int)

    def test_log_usage_with_config(self):
        """Логирование с конфигом."""
        from src.api_keys import create_key, log_usage

        key = create_key("log_config_test")
        config = {"facilityId": "APP1", "slotDate": "2026-01-01"}

        usage_id = log_usage(key["key"], "res-1", "cap-1", config_json=config)
        assert usage_id is not None

    def test_get_usage_log_entry(self):
        """Получение записи лога."""
        from src.api_keys import create_key, get_usage_log_entry, log_usage

        key = create_key("get_log_test")
        usage_id = log_usage(key["key"], "res-get", "cap-get")

        entry = get_usage_log_entry(usage_id)
        assert entry is not None
        assert entry["reservation_id"] == "res-get"
        assert entry["captcha_id"] == "cap-get"

    def test_get_usage_log_entry_not_found(self):
        """Получение несуществующей записи."""
        from src.api_keys import get_usage_log_entry

        entry = get_usage_log_entry(99999)
        assert entry is None

    def test_confirm_usage(self):
        """Подтверждение использования."""
        from src.api_keys import (
            create_key,
            get_key_by_id,
            get_usage_log_entry,
            log_usage,
            confirm_usage,
        )

        key = create_key("confirm_test")
        usage_id = log_usage(key["key"], "res-confirm", "cap-confirm")

        confirm_usage(usage_id, slot_date="2026-01-01")

        entry = get_usage_log_entry(usage_id)
        assert entry["status"] == "confirmed"
        assert entry["slot_date"] == "2026-01-01"

        key_record = get_key_by_id(key["id"])
        assert key_record["usage_count"] == 1

    def test_fail_usage(self):
        """Отметка ошибки."""
        from src.api_keys import create_key, get_usage_log_entry, log_usage, fail_usage

        key = create_key("fail_test")
        usage_id = log_usage(key["key"], "res-fail", "cap-fail")

        fail_usage(usage_id, "Captcha timeout", "captcha", slot_date="2026-01-02")

        entry = get_usage_log_entry(usage_id)
        assert entry["status"] == "failed"
        assert entry["error_message"] == "Captcha timeout"
        assert entry["error_stage"] == "captcha"

    def test_list_usages(self):
        """Список всех использований."""
        from src.api_keys import create_key, list_usages, log_usage

        key = create_key("list_test")
        log_usage(key["key"], "res-1", "cap-1")
        log_usage(key["key"], "res-2", "cap-2")

        usages = list_usages(key["id"])
        assert len(usages) >= 2

    def test_list_usages_with_logs(self):
        """Логи сохраняются в БД."""
        from src.api_keys import create_key, get_usage_log_entry, log_usage, confirm_usage

        key = create_key("logs_test")
        usage_id = log_usage(key["key"], "res-logs", "cap-logs")
        confirm_usage(usage_id, logs=["step1", "step2"])

        entry = get_usage_log_entry(usage_id)
        assert entry["logs"] == ["step1", "step2"]


class TestAdminKey:
    """Тесты специального админского ключа."""

    def test_admin_key_exists(self):
        """Админский ключ создаётся при инициализации."""
        from src.api_keys import get_key_by_label, init_db

        init_db()
        admin = get_key_by_label("admin")

        assert admin is not None
        assert admin["label"] == "admin"


class TestEdgeCases:
    """Граничные случаи."""

    def test_update_nonexistent_key(self):
        """Обновление несуществующего ключа."""
        from src.api_keys import update_key

        result = update_key(99999, label="nonexistent")
        assert result is None

    def test_validate_empty_key(self):
        """Валидация пустого ключа."""
        from src.api_keys import validate_key

        result = validate_key("")
        assert result["valid"] is False

    def test_delete_nonexistent_usage(self):
        """Удаление несуществующей записи использования."""
        from src.api_keys import fail_usage

        # Сначала создаём ключ
        from src.api_keys import create_key

        key = create_key("fail_nonexistent")

        result = fail_usage(99999, "error", "test")
        assert result is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])