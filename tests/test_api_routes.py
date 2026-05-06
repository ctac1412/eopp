"""
EOPP Captcha Solver - API Routes Unit Tests

Тесты всех API эндпоинтов (без блокирующих SSE тестов).
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


# === Fixtures ===
@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    """Изолируем БД для каждого теста - используем временный файл."""
    import src.db.connection as conn_module
    import src.db.init as init_module

    # Создаём уникальный temp файл
    test_db = tempfile.mktemp(suffix=".db")
    
    # Патчим путь к БД
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    
    # Переинициализируем БД
    init_module.init_db()

    yield

    # cleanup
    try:
        conn_module.get_connection().close()
    except:
        pass
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except:
            pass


@pytest.fixture
def client(isolate_db):
    """Создание тестового клиента."""
    from src.app import create_app

    app = create_app(use_tests=False)
    return TestClient(app)


@pytest.fixture
def admin_token():
    return "13243546"


@pytest.fixture
def api_key(client, admin_token):
    """Создать API ключ для тестов."""
    response = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000},
    )
    return response.json()["key"]


# === API Keys Tests ===
class TestAPIKeys:
    """Тесты API Keys эндпоинтов."""

    def test_create_key(self, client, admin_token):
        """Создание ключа."""
        response = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "test", "max_uses": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "key" in data
        assert data["max_uses"] == 10

    def test_list_keys(self, client, admin_token):
        """Список ключей."""
        client.post("/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "test2"})
        response = client.get("/api-keys", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_update_key(self, client, admin_token):
        """Обновление ключа."""
        create = client.post(
            "/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "upd"}
        )
        kid = create.json()["id"]
        response = client.put(
            f"/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"label": "updated"},
        )
        assert response.status_code == 200
        assert response.json()["label"] == "updated"

    def test_delete_key(self, client, admin_token):
        """Удаление ключа."""
        create = client.post(
            "/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "del"}
        )
        kid = create.json()["id"]
        response = client.delete(f"/api-keys/{kid}", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_validate_key_valid(self, client, admin_token, api_key):
        """Валидация валидного ключа."""
        response = client.get(f"/validate-key?api_key={api_key}")
        assert response.status_code == 200
        assert response.json()["valid"] is True

    def test_validate_key_invalid(self, client):
        """Валидация невалидного ключа."""
        response = client.get("/validate-key?api_key=invalid")
        assert response.status_code == 200
        assert response.json()["valid"] is False

    def test_key_status(self, client, admin_token, api_key):
        """Статус ключа."""
        response = client.get(f"/api-key-status?key={api_key}")
        assert response.status_code == 200
        data = response.json()
        assert "remaining" in data
        assert data["valid"] is True

    def test_reset_usage(self, client, admin_token):
        """Сброс счётчика."""
        create = client.post(
            "/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "rst"}
        )
        kid = create.json()["id"]
        response = client.post(
            f"/api-keys/{kid}/reset-usage", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 200
        assert response.json()["usage_count"] == 0


# === Usage Tests ===
class TestUsage:
    """Тесты Usage эндпоинтов."""

    def test_register_usage(self, client, api_key):
        """Регистрация использования."""
        response = client.post(
            "/register-usage",
            json={
                "api_key": api_key,
                "reservation_id": "res-123",
                "captcha_id": "capt-123",
            },
        )
        assert response.status_code == 200
        assert "usage_log_id" in response.json()

    def test_register_usage_with_config(self, client, api_key):
        """Регистрация с конфигом (создаёт слоты)."""
        response = client.post(
            "/register-usage",
            json={
                "api_key": api_key,
                "reservation_id": "res-456",
                "config_json": {"facilityId": "APP1", "slotDate": "2026-01-01"},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "group_id" in data
        assert data["is_master"] is True

    def test_confirm_usage(self, client, api_key):
        """Подтверждение использования."""
        # Регистрируем
        reg = client.post(
            "/register-usage",
            json={"api_key": api_key, "reservation_id": "res-conf"},
        )
        uid = reg.json()["usage_log_id"]

        # Подтверждаем
        response = client.post("/confirm-usage", json={"api_key": api_key, "usage_log_id": uid})
        assert response.status_code == 200

    def test_fail_usage(self, client, api_key):
        """Отметка ошибки."""
        reg = client.post(
            "/register-usage",
            json={"api_key": api_key, "reservation_id": "res-fail"},
        )
        uid = reg.json()["usage_log_id"]

        response = client.post(
            "/fail-usage",
            json={
                "api_key": api_key,
                "usage_log_id": uid,
                "error_message": "Error",
                "error_stage": "captcha",
            },
        )
        assert response.status_code == 200

    def test_usage_log(self, client):
        """История использования."""
        response = client.get("/usage-log")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_usage_log_filter(self, client, api_key):
        """Фильтрация по ключу."""
        response = client.get(f"/usage-log?api_key={api_key}")
        assert response.status_code == 200


# === Mock Tests ===
class TestMock:
    """Тесты Mock эндпоинтов."""

    def test_set_mock_config(self, client, admin_token):
        """Установка конфига."""
        response = client.post(
            "/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "429"}}},
        )
        assert response.status_code == 200

    def test_get_mock_config(self, client, admin_token):
        """Получение конфига."""
        client.post(
            "/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "success"}}},
        )
        response = client.get("/mock-config")
        assert response.status_code == 200

    def test_reset_mock_config(self, client, admin_token):
        """Сброс конфига."""
        response = client.delete("/mock-config", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_mock_captcha(self, client):
        """Mock капча."""
        response = client.post(
            "/reservations-api/v1/captcha",
            json={"facilityId": "f1", "timeSlotData": "data"},
        )
        assert response.status_code == 200

    def test_mock_captcha_validate(self, client):
        """Валидация капчи."""
        response = client.post(
            "/reservations-api/v1/captcha-validate",
            json={"captchaToken": "token"},
        )
        assert response.status_code == 200
        assert "successToken" in response.json()

    def test_mock_slots(self, client):
        """Mock слоты."""
        response = client.get(
            "/reservations-api/v1/timeslot/AvailableSlots?facilityId=f1&date=2026-01-01"
        )
        assert response.status_code == 200
        assert "slots" in response.json()

    def test_mock_reschedule(self, client):
        """Mock перенос."""
        response = client.post("/reservations-api/v1/Reschedule", json={"reservationId": "r1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True

    def test_mock_submit_draft(self, client):
        """Mock создание брони."""
        response = client.post("/reservations-api/v1/SubmitDraft", json={"facilityId": "f1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True


# === Admin Tests ===
class TestAdmin:
    """Тесты Admin эндпоинтов."""

    def test_admin_auth_success(self, client, admin_token):
        """Успешная авторизация."""
        response = client.post("/admin/auth", json={"token": admin_token})
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_admin_auth_fail(self, client):
        """Неудачная авторизация."""
        response = client.post("/admin/auth", json={"token": "wrong"})
        assert response.status_code == 401

    def test_admin_streams(self, client, admin_token):
        """Список потоков."""
        response = client.get("/admin/streams", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_admin_streams_unauthorized(self, client):
        """Потоки без авторизации."""
        response = client.get("/admin/streams")
        assert response.status_code == 401

    def test_admin_test_stats(self, client, admin_token):
        """Статистика тестов."""
        response = client.get("/admin/test-stats", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert response.json() is not None

    def test_admin_benchmark(self, client, admin_token):
        """Бенчмарк."""
        response = client.get("/admin/benchmark", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200


# === Frontend Tests ===
class TestFrontend:
    """Тесты Frontend эндпоинтов."""

    def test_index(self, client):
        """Главная страница."""
        response = client.get("/")
        assert response.status_code in [200, 503]

    def test_test_injector_edit(self, client):
        """Тестовая страница редактирования."""
        response = client.get("/test-injector/edit")
        assert response.status_code == 200

    def test_test_injector_reschedule(self, client):
        """Тестовая страница переноса."""
        response = client.get("/test-injector/reschedule")
        assert response.status_code == 200


# === Captcha Tests ===
class TestCaptcha:
    """Тесты Captcha эндпоинтов."""

    def test_solve_captcha_auto_solve(self, client, api_key):
        """Тест auto_solve с невалидными данными - ожидаем ошибку."""
        import warnings

        # Этот тест требует реальные данные капчи, пропускаем
        pytest.skip("Требует реальные данные капчи с base64 изображениями")

    def test_solve_captcha_invalid_key(self, client):
        """Капча с невалидным ключом."""
        response = client.post(
            "/solve-captcha",
            json={
                "api_key": "invalid",
                "auto_solve": True,
                "puzzle": {"tiles": [], "variantsCapture": []},
            },
        )
        assert response.status_code == 403

    def test_broadcast(self, client, admin_token):
        """Broadcast события."""
        response = client.post(
            "/broadcast",
            headers={"X-Admin-Token": admin_token},
            json={"type": "test"},
        )
        assert response.status_code == 200


# === Slots Tests ===
class TestSlots:
    """Тесты Slots эндпоинтов."""

    def test_slots_group_requires_params(self, client):
        """Требуются параметры."""
        response = client.get("/slots-group")
        assert response.status_code == 422

    def test_slots_group_requires_auth(self, client):
        """Требуется авторизация."""
        response = client.post(
            "/slots-group",
            json={"group_id": "g1", "consumer_id": 0, "api_key": "invalid"},
        )
        assert response.status_code == 403


# === Tariff Tests ===
class TestTariffs:
    """Тесты Tariff эндпоинтов."""

    def test_get_tariff_not_found(self, client, admin_token, api_key):
        """Получение несуществующего тарифа."""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        response = client.get(
            f"/admin/tariffs/{key_data['id']}", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 404

    def test_create_tariff(self, client, admin_token, api_key):
        """Создание тарифа."""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        response = client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["price_create"] == 100
        assert data["price_reschedule"] == 50

    def test_update_tariff(self, client, admin_token, api_key):
        """Обновление тарифа."""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50},
        )
        response = client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 200, "price_reschedule": 50},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["price_create"] == 200
        assert data["price_reschedule"] == 50

    def test_delete_tariff(self, client, admin_token, api_key):
        """Удаление тарифа."""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50},
        )
        response = client.delete(
            f"/admin/tariffs/{key_data['id']}", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 200
        get_response = client.get(
            f"/admin/tariffs/{key_data['id']}", headers={"X-Admin-Token": admin_token}
        )
        assert get_response.status_code == 404


# === Withdrawal Tests ===
class TestWithdrawals:
    """Тесты Withdrawal эндпоинтов."""

    def test_list_withdrawals_empty(self, client, admin_token):
        """Пустой список выводов."""
        response = client.get("/admin/withdrawals", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert response.json() == []

    def test_create_withdrawal(self, client, admin_token):
        """Создание вывода."""
        response = client.post(
            "/admin/withdrawals",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Test", "percent": 10, "requisites": "123456"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test"
        assert data["percent"] == 10

    def test_update_withdrawal(self, client, admin_token):
        """Обновление вывода."""
        create = client.post(
            "/admin/withdrawals",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Test", "percent": 10, "requisites": "123456"},
        )
        wid = create.json()["id"]
        response = client.put(
            f"/admin/withdrawals/{wid}",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Updated", "percent": 15, "requisites": "789012"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated"
        assert data["percent"] == 15

    def test_delete_withdrawal(self, client, admin_token):
        """Удаление вывода."""
        create = client.post(
            "/admin/withdrawals",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Test", "percent": 10, "requisites": "123456"},
        )
        wid = create.json()["id"]
        response = client.delete(
            f"/admin/withdrawals/{wid}", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 200
        get_response = client.get("/admin/withdrawals", headers={"X-Admin-Token": admin_token})
        assert len(get_response.json()) == 0


# === Update API Key Tests ===
class TestUpdateApiKey:
    """Тесты обновления API ключей."""

    def test_update_api_key_comment(self, client, admin_token):
        """Обновление комментария."""
        create = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "comment_test"},
        )
        kid = create.json()["id"]
        response = client.patch(
            f"/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"comment": "Test comment"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["comment"] == "Test comment"


# === Update Usage Log Tests ===
class TestUpdateUsageLog:
    """Тесты обновления логов использования."""

    def test_update_usage_log_price(self, client, api_key, admin_token):
        """Обновление цены."""
        reg = client.post(
            "/register-usage",
            json={"api_key": api_key, "reservation_id": "res-price"},
        )
        uid = reg.json()["usage_log_id"]
        response = client.patch(
            f"/admin/usage-log/{uid}",
            headers={"X-Admin-Token": admin_token},
            json={"price": 500},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["price"] == 500

    def test_update_usage_log_paid(self, client, api_key, admin_token):
        """Обновление флага оплаты."""
        reg = client.post(
            "/register-usage",
            json={"api_key": api_key, "reservation_id": "res-paid"},
        )
        uid = reg.json()["usage_log_id"]
        response = client.patch(
            f"/admin/usage-log/{uid}",
            headers={"X-Admin-Token": admin_token},
            json={"paid": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True


# === Generate Invoice Tests ===
class TestGenerateInvoice:
    """Тесты генерации счётов."""

    def test_generate_invoice_missing_data(self, client, admin_token):
        """Генерация счёта с отсутствующими данными."""
        response = client.post(
            "/admin/generate-invoice",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": 999, "usage_log_ids": [], "withdrawal_id": 999},
        )
        assert response.status_code in [404, 400, 500]

    def test_generate_invoice_no_logs(self, client, admin_token, api_key):
        """Генерация счёта без логов."""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        create_w = client.post(
            "/admin/withdrawals",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Test", "percent": 10, "requisites": "123456"},
        )
        wid = create_w.json()["id"]
        response = client.post(
            "/admin/generate-invoice",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": key_data["id"], "usage_log_ids": [], "withdrawal_id": wid},
        )
        assert response.status_code in [400, 500]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
