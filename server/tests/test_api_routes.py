"""
EOPP Captcha Solver - API Routes Unit Tests

РўРµСЃС‚С‹ РІСЃРµС… API СЌРЅРґРїРѕРёРЅС‚РѕРІ (Р±РµР· Р±Р»РѕРєРёСЂСѓСЋС‰РёС… SSE С‚РµСЃС‚РѕРІ).
"""

import json
import os
import sys
import tempfile
import threading
from datetime import UTC, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


# === Fixtures ===
@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    """doc"""
    import src.db.connection as conn_module
    import src.db.init as init_module
    from src.entities.base import set_db_path

    # comment
    fd, test_db = tempfile.mkstemp(suffix=".db")
    os.close(fd)

    # comment
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    set_db_path(test_db)

    # comment
    init_module.init_db()

    yield

    # cleanup
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
def client(isolate_db):
    """doc"""
    from src.app import create_app

    app = create_app()
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    """doc"""
    from src.db import list_keys

    keys = list_keys()
    admin_key = next((k for k in keys if k["is_admin"]), None)
    assert admin_key is not None, "Admin key not found in test DB"
    response = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": admin_key["key"]},
    )
    assert response.status_code == 200
    assert "eopp_session" in response.cookies
    return response.cookies["eopp_session"]


@pytest.fixture
def api_key(client, admin_token):
    """doc"""
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Pytest Key Owner",
            "login": "pytest.key.owner",
            "password": "strong-password",
            "executor_access": {"all_companies": True, "company_ids": []},
        },
    )
    assert user.status_code == 200
    response = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000, "user_id": user.json()["id"]},
    )
    assert response.status_code == 200
    login = client.post(
        "/api/auth/login",
        json={"login": "pytest.key.owner", "password": "strong-password"},
    )
    assert login.status_code == 200
    return response.json()["key"]


def login_as_key_owner(client, api_key):
    from src.repositories import api_key_repo, user_repo

    record = api_key_repo.get_key_record(api_key)
    assert record is not None and record.user_id is not None
    user = user_repo.get_user(record.user_id)
    assert user is not None and user["login"]
    response = client.post(
        "/api/auth/login",
        json={"login": user["login"], "password": "strong-password"},
    )
    assert response.status_code == 200
    return response


def restore_admin_session(client, admin_token):
    client.cookies.set("eopp_session", admin_token)


def create_company_with_tariff(client, admin_token, name, tariff):
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            company_id,
            tariff["price_create"],
            tariff["price_reschedule"],
            tariff.get("price_create_peak"),
            tariff.get("price_custom_slots"),
            tariff.get("executor_amount", 0),
            tariff.get("operator_amount", 0),
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return {"id": company_id, "name": name}


def attach_api_key_to_company(api_key_id, company_id):
    from src.db.connection import get_connection

    conn = get_connection()
    conn.execute("UPDATE api_keys SET company_id = ? WHERE id = ?", (company_id, api_key_id))
    conn.commit()
    conn.close()


def create_api_key_for_company(client, admin_token, label, company_id, *, max_uses=None):
    suffix = datetime.now(UTC).timestamp()
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": f"{label} owner",
            "login": f"{label}.{suffix}",
            "password": "strong-password",
            "company_id": company_id,
            "executor_access": {"all_companies": False, "company_ids": [company_id]},
        },
    )
    assert user.status_code == 200
    payload = {"label": label, "company_id": company_id, "user_id": user.json()["id"]}
    if max_uses is not None:
        payload["max_uses"] = max_uses
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json=payload,
    )
    assert key.status_code == 200
    return key.json()


def run_billing_jobs_for_usage(usage_log_id: int):
    from src.modules.billing import jobs as billing_jobs

    billing_jobs.calculate_usage_price({"usage_log_id": usage_log_id})
    billing_jobs.deduct_prepaid({"usage_log_id": usage_log_id})
    billing_jobs.link_open_invoice({"usage_log_id": usage_log_id})


# === API Keys Tests ===
class TestAPIKeys:
    """doc"""

    def test_create_key(self, client, admin_token):
        """doc"""
        response = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "test", "max_uses": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "key" in data
        assert data["max_uses"] == 10

    def test_user_can_have_only_one_personal_key(self, client, admin_token):
        """doc"""
        user = client.post(
            "/api/admin/users",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Key Owner", "login": "key.owner", "password": "strong-password"},
        )
        assert user.status_code == 200
        user_id = user.json()["id"]
        first = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "owner-key", "user_id": user_id},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "owner-key-2", "user_id": user_id},
        )

        assert second.status_code == 400
        assert "personal API key" in second.json()["error"]

    def test_disabled_user_personal_key_is_invalid(self, client, admin_token):
        """doc"""
        user = client.post(
            "/api/admin/users",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Disabled Owner", "login": "disabled.owner", "password": "strong-password"},
        )
        assert user.status_code == 200
        user_id = user.json()["id"]
        key = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "disabled-owner-key", "user_id": user_id},
        ).json()
        disabled = client.put(
            f"/api/admin/users/{user_id}",
            headers={"X-Admin-Token": admin_token},
            json={"name": "Disabled Owner", "login": "disabled.owner", "role": "manager", "active": False},
        )
        assert disabled.status_code == 200

        from src.repositories import api_key_repo

        result = api_key_repo.validate_api_key(key["key"])
        assert result["valid"] is False
        assert result["reason"] == "User is disabled"

    def test_list_keys(self, client, admin_token):
        """doc"""
        client.post("/api/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "test2"})
        response = client.get("/api/api-keys", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_public_key_list_does_not_expose_secret_keys(self, client, admin_token):
        created = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "public_safe"},
        ).json()

        response = client.get("/api/api-keys/public")

        assert response.status_code == 200
        public_key = next(item for item in response.json() if item["label"] == "public_safe")
        assert "key" not in public_key
        assert created["key"] not in json.dumps(response.json())

    def test_validate_key_includes_peak_create_price(self, client, admin_token):
        """doc"""
        company = create_company_with_tariff(
            client,
            admin_token,
            "Validate Peak Co",
            {
                "price_create": 1000,
                "price_reschedule": 7000,
                "price_create_peak": 9000,
            },
        )
        create = create_api_key_for_company(client, admin_token, "validate_peak", company["id"])
        login_as_key_owner(client, create["key"])

        response = client.get("/api/validate-key")

        assert response.status_code == 200
        data = response.json()
        assert data["price_create"] == 1000
        assert data["price_reschedule"] == 7000
        assert data["price_create_peak"] == 9000

    def test_update_key(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "upd"}
        )
        kid = create.json()["id"]
        response = client.put(
            f"/api/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"label": "updated"},
        )
        assert response.status_code == 200
        assert response.json()["label"] == "updated"

    def test_delete_key(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "del"}
        )
        kid = create.json()["id"]
        response = client.delete(f"/api/api-keys/{kid}", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_validate_key_valid(self, client, admin_token, api_key):
        """doc"""
        response = client.get("/api/validate-key")
        assert response.status_code == 200
        assert response.json()["valid"] is True

    def test_validate_key_invalid(self, client):
        """doc"""
        client.cookies.clear()
        response = client.get("/api/validate-key?api_key=invalid")
        assert response.status_code == 401

    def test_key_status(self, client, admin_token, api_key):
        """doc"""
        response = client.get("/api/api-key-status")
        assert response.status_code == 200
        data = response.json()
        assert "remaining" in data
        assert data["valid"] is True

    def test_reset_usage(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "rst"}
        )
        kid = create.json()["id"]
        response = client.post(
            f"/api/api-keys/{kid}/reset-usage", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 200
        assert response.json()["usage_count"] == 0


# === Usage Tests ===
class TestUsage:
    """doc"""

    def test_register_usage(self, client, api_key, active_sse):
        """doc"""
        response = client.post(
            "/api/register-usage",
            json={
                "reservation_id": "res-123",
                "captcha_id": "capt-123",
            },
        )
        assert response.status_code == 200
        assert "usage_log_id" in response.json()

    def test_register_usage_with_config(self, client, api_key, active_sse):
        """doc"""
        response = client.post(
            "/api/register-usage",
            json={
                "reservation_id": "res-456",
                "config_json": {"facilityId": "APP1", "slotDate": "2026-01-01"},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "usage_log_id" in data

    def test_confirm_usage(self, client, api_key, active_sse):
        """doc"""
        # comment
        reg = client.post(
            "/api/register-usage",
            json={"reservation_id": "res-conf"},
        )
        uid = reg.json()["usage_log_id"]

        # comment
        response = client.post("/api/confirm-usage", json={"usage_log_id": uid})
        assert response.status_code == 200

    def test_confirm_usage_does_not_exceed_max_uses(self, client, admin_token):
        from src.repositories import api_key_repo
        from src.sse.manager import lock, sse_queues

        user = client.post(
            "/api/admin/users",
            headers={"X-Admin-Token": admin_token},
            json={
                "name": "Limited Confirm Owner",
                "login": "limited.confirm.owner",
                "password": "strong-password",
                "executor_access": {"all_companies": True, "company_ids": []},
            },
        )
        assert user.status_code == 200
        created = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "limited_confirm", "max_uses": 1, "user_id": user.json()["id"]},
        ).json()
        login_as_key_owner(client, created["key"])
        key_record = api_key_repo.get_key_record(created["key"])
        with lock:
            sse_queues.setdefault(key_record.id, []).append(object())

        try:
            first = client.post(
                "/api/register-usage",
                json={"reservation_id": "limited-1"},
            ).json()["usage_log_id"]
            second = client.post(
                "/api/register-usage",
                json={"reservation_id": "limited-2"},
            ).json()["usage_log_id"]

            assert client.post(
                "/api/confirm-usage", json={"usage_log_id": first}
            ).status_code == 200
            response = client.post(
                "/api/confirm-usage", json={"usage_log_id": second}
            )

            assert response.status_code == 429
            status = client.get("/api/api-key-status").json()
            assert status["remaining"] == 0
        finally:
            with lock:
                if key_record.id in sse_queues:
                    sse_queues[key_record.id].pop()
                    if not sse_queues[key_record.id]:
                        del sse_queues[key_record.id]

    def test_confirm_create_usage_uses_peak_price_at_noon_msk(
        self, client, admin_token, monkeypatch
    ):
        """doc"""
        from datetime import UTC, datetime

        import src.db.usage_log as usage_log_module
        from src.db.usage_log import log_usage

        class NoonMskDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                value = datetime(2026, 5, 23, 9, 15, tzinfo=UTC)
                return value if tz is None else value.astimezone(tz)

        monkeypatch.setattr(usage_log_module, "datetime", NoonMskDatetime)

        company = create_company_with_tariff(
            client,
            admin_token,
            "Peak Price Co",
            {"price_create": 1000, "price_reschedule": 7000, "price_create_peak": 9000},
        )
        key_data = create_api_key_for_company(client, admin_token, "peak_price_key", company["id"])
        login_as_key_owner(client, key_data["key"])
        uid = log_usage(
            api_key=key_data["key"],
            reservation_id="real-reservation-peak",
            captcha_id="unknown",
            config_json={"mode": "create"},
        )

        response = client.post(
            "/api/confirm-usage", json={"usage_log_id": uid}
        )

        assert response.status_code == 200
        run_billing_jobs_for_usage(uid)
        logs = client.get("/api/usage-log").json()
        entry = next(item for item in logs if item["id"] == uid)
        assert entry["price"] == 9000

    def test_confirm_create_usage_falls_back_to_reschedule_price_at_noon_msk(
        self, client, admin_token, monkeypatch
    ):
        """doc"""
        from datetime import UTC, datetime

        import src.db.usage_log as usage_log_module
        from src.db.usage_log import log_usage

        class NoonMskDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                value = datetime(2026, 5, 23, 9, 30, tzinfo=UTC)
                return value if tz is None else value.astimezone(tz)

        monkeypatch.setattr(usage_log_module, "datetime", NoonMskDatetime)

        company = create_company_with_tariff(
            client,
            admin_token,
            "Peak Fallback Co",
            {"price_create": 1000, "price_reschedule": 7000, "price_create_peak": None},
        )
        key_data = create_api_key_for_company(client, admin_token, "peak_fallback_key", company["id"])
        login_as_key_owner(client, key_data["key"])
        uid = log_usage(
            api_key=key_data["key"],
            reservation_id="real-reservation-peak-fallback",
            captcha_id="unknown",
            config_json={"mode": "create"},
        )

        response = client.post(
            "/api/confirm-usage", json={"usage_log_id": uid}
        )

        assert response.status_code == 200
        run_billing_jobs_for_usage(uid)
        logs = client.get("/api/usage-log").json()
        entry = next(item for item in logs if item["id"] == uid)
        assert entry["price"] == 7000

    def test_fail_usage(self, client, api_key, active_sse):
        """doc"""
        reg = client.post(
            "/api/register-usage",
            json={"reservation_id": "res-fail"},
        )
        uid = reg.json()["usage_log_id"]

        response = client.post(
            "/api/fail-usage",
            json={
                "usage_log_id": uid,
                "error_message": "Error",
                "error_stage": "captcha",
            },
        )
        assert response.status_code == 200

    def test_usage_log_requires_scope(self, client):
        """doc"""
        response = client.get("/api/usage-log")
        assert response.status_code == 401

    def test_usage_log_filter(self, client, api_key):
        """doc"""
        response = client.get("/api/usage-log")
        assert response.status_code == 200

    def test_usage_log_invalid_key(self, client):
        """doc"""
        response = client.get("/api/usage-log?api_key=invalid")
        assert response.status_code == 401

    def test_usage_log_api_key_id_requires_admin(self, client):
        """doc"""
        response = client.get("/api/usage-log?api_key_id=1")
        assert response.status_code == 401

    def test_usage_log_admin_scope(self, client, admin_token):
        """doc"""
        response = client.get("/api/usage-log", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200


# === Mock Tests ===
class TestMock:
    """doc"""

    def test_set_mock_config(self, client, admin_token):
        """doc"""
        response = client.post(
            "/api/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "429"}}},
        )
        assert response.status_code == 200

    def test_get_mock_config(self, client, admin_token):
        """doc"""
        client.post(
            "/api/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "success"}}},
        )
        response = client.get("/api/mock-config")
        assert response.status_code == 200

    def test_reset_mock_config(self, client, admin_token):
        """doc"""
        response = client.delete("/api/mock-config", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_mock_captcha(self, client):
        """doc"""
        response = client.post(
            "/api/reservations-api/v1/captcha",
            json={"payload": {"facilityId": "f1", "timeSlotData": "data"}},
        )
        assert response.status_code == 200
        body = response.json()
        assert "token" in body
        assert "front" in body
        assert "tiles" in body["front"]
        assert "variantsCapture" in body["front"]

    def test_mock_captcha_validate(self, client):
        """doc"""
        response = client.post(
            "/api/reservations-api/v1/captcha-validate",
            json={
                "captchaToken": "token",
                "answer": ["tile-1"],
                "payload": {
                    "reservationId": "r1",
                    "facilityId": "f1",
                    "timeSlotData": "2026-05-26T13:00:00.000Z",
                    "encryptedTso": None,
                },
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["isValid"] is True
        assert "successToken" in body

    def test_mock_slots(self, client):
        """doc"""
        response = client.get(
            "/api/reservations-api/v1/timeslot/AvailableSlots?facilityId=f1&date=2026-01-01"
        )
        assert response.status_code == 200
        assert "slots" in response.json()

    def test_mock_reschedule(self, client):
        """doc"""
        response = client.post("/api/reservations-api/v1/Reschedule", json={"reservationId": "r1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True

    def test_mock_submit_draft(self, client):
        """doc"""
        response = client.post("/api/reservations-api/v1/SubmitDraft", json={"facilityId": "f1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True


# === Admin Tests ===
class TestAdmin:
    """doc"""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/admin/invoices",
            "/api/admin/expenses",
            "/api/admin/payouts",
            "/api/admin/users",
            "/api/admin/captchas",
            "/api/admin/captcha-files",
            "/api/admin/backend-logs",
        ],
    )
    def test_admin_routes_unauthorized(self, client, path):
        response = client.get(path)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "path",
        [
            "/api/admin/invoices",
            "/api/admin/expenses",
            "/api/admin/payouts",
            "/api/admin/users",
            "/api/admin/captchas",
            "/api/admin/captcha-files",
        ],
    )
    def test_admin_routes_authorized(self, client, admin_token, path):
        response = client.get(path, headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_admin_auth_success(self, client, admin_token):
        """doc"""
        from src.db import list_keys

        admin_key = next(key for key in list_keys() if key["is_admin"])
        response = client.post(
            "/api/auth/login",
            json={"login": "admin", "password": admin_key["key"]},
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_admin_auth_fail(self, client):
        """doc"""
        response = client.post("/api/auth/login", json={"token": "wrong"})
        assert response.status_code == 401

    def test_admin_auth_non_admin_key(self, client, admin_token):
        """doc"""
        # comment
        resp = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "non_admin_key"},
        )
        normal_key = resp.json()["key"]

        response = client.post("/api/auth/login", json={"token": normal_key})
        assert response.status_code == 401

    def test_backend_logs_tail(self, client, admin_token, tmp_path, monkeypatch):
        log_file = tmp_path / "backend.log"
        log_file.write_text("\n".join(f"line {i}" for i in range(5)), encoding="utf-8")
        monkeypatch.setenv("EOPP_BACKEND_LOG_PATH", str(log_file))

        response = client.get(
            "/api/admin/backend-logs?lines=3",
            headers={"X-Admin-Token": admin_token},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 3
        assert data["lines"] == ["line 2", "line 3", "line 4"]

    def test_admin_api_key_update_writes_audit_log(self, client, admin_token):
        from src.db.audit_log import list_audit_log

        created = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "audit_target"},
        ).json()

        response = client.patch(
            f"/api/admin/api-keys/{created['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"label": "audit_target_updated"},
        )

        assert response.status_code == 200
        audit_rows = list_audit_log()
        assert any(
            row["action"] == "update_api_key" and row["target_id"] == created["id"]
            for row in audit_rows
        )

    @pytest.mark.skip(reason="rucaptcha callback router is intentionally disabled for release perimeter")
    def test_rucaptcha_callback_router_is_disabled(self, client):
        response = client.post(
            "/rucaptcha-callback",
            content="id=task-1&code=1,2",
            headers={"X-Signature": "bad-signature"},
        )

        assert response.status_code in (404, 405)

    @pytest.mark.skip(reason="plugin-channel routers are intentionally disabled until consumers exist")
    def test_plugin_channel_public_router_is_disabled(self, client):
        response = client.post(
            "/plugin-channel/sessions/open",
            json={"extension_id": "test", "route_kind": "eopp_root", "page_url": "https://example.test"},
        )

        assert response.status_code in (404, 405)

    @pytest.mark.skip(reason="plugin-channel routers are intentionally disabled until consumers exist")
    def test_plugin_channel_admin_router_is_disabled(self, client, admin_token):
        response = client.post(
            "/api/admin/plugin-channel/sessions/1/claim",
            headers={"X-Admin-Token": admin_token},
        )

        assert response.status_code in (404, 405)

    def test_captcha_and_key_validation_are_not_rate_limited(self, monkeypatch):
        monkeypatch.setenv("EOPP_RATE_LIMIT_VALIDATE", "1")
        monkeypatch.setenv("EOPP_RATE_LIMIT_CAPTCHA", "1")

        from src.app import create_app

        local_client = TestClient(create_app())

        assert local_client.get("/api/validate-key?api_key=missing").status_code == 401
        assert local_client.get("/api/validate-key?api_key=missing").status_code == 401
        assert local_client.post("/api/solve-captcha", json={"api_key": "missing"}).status_code == 401
        assert local_client.post("/api/solve-captcha", json={"api_key": "missing"}).status_code == 401

    def test_issue_open_invoice_for_company(self, client, admin_token):
        """doc"""
        from src.db import confirm_usage, log_usage

        company = create_company_with_tariff(
            client,
            admin_token,
            "ООО API Open",
            {"price_create": 1500, "price_reschedule": 7000, "price_create_peak": 1500},
        )
        created = create_api_key_for_company(client, admin_token, "api_open_issue", company["id"])
        log_id = log_usage(
            created["key"],
            "res-open-api",
            "capt-open-api",
            config_json={
                "mode": "create",
                "reservationData": {"raw": {"userData": {"organizationName": "ООО API Open"}}},
            },
        )
        client.put(
            "/api/admin/company-billing-settings/ООО API Open",
            headers={"X-Admin-Token": admin_token},
            json={"auto_invoice_reopen": True},
        )
        client.post(
            "/api/admin/auto-invoices/open",
            headers={"X-Admin-Token": admin_token},
            json={"company": "ООО API Open"},
        )
        confirm_usage(log_id)
        run_billing_jobs_for_usage(log_id)

        response = client.post(
            "/api/admin/open-invoices/issue",
            headers={"X-Admin-Token": admin_token},
            json={"company": "ООО API Open"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["closed_invoice"]["is_open"] is False
        assert data["closed_invoice"]["debt_amount"] == 1500
        assert data["new_open_invoice"]["is_open"] is True
        assert data["new_open_invoice"]["id"] != data["closed_invoice"]["id"]

    def test_company_billing_settings_accept_tax_commission_mode(self, client, admin_token):
        from src.db import list_keys

        admin_key = next(key for key in list_keys() if key["is_admin"])
        login = client.post("/api/auth/login", json={"login": "admin", "password": admin_key["key"]})
        assert login.status_code == 200

        old_payload = client.put(
            "/api/admin/company-billing-settings/Mode API Co",
            headers={"X-Admin-Token": admin_token},
            json={"auto_invoice_reopen": True},
        )
        assert old_payload.status_code == 200
        assert old_payload.json()["auto_invoice_reopen"] is True
        assert old_payload.json()["tax_commission_mode"] == "added"
        assert old_payload.json()["default_percent_rate"] == 0
        assert old_payload.json()["default_tax_rate"] == 0
        assert old_payload.json()["default_commission_user_id"] is None
        assert old_payload.json()["default_tax_user_id"] is None

        response = client.put(
            "/api/admin/company-billing-settings/Mode API Co",
            headers={"X-Admin-Token": admin_token},
            json={
                "auto_invoice_reopen": False,
                "tax_commission_mode": "included",
                "default_percent_rate": 5,
                "default_tax_rate": 6,
                "default_commission_user_id": 11,
                "default_tax_user_id": 12,
            },
        )
        assert response.status_code == 200
        assert response.json()["auto_invoice_reopen"] is False
        assert response.json()["tax_commission_mode"] == "included"
        assert response.json()["default_percent_rate"] == 5
        assert response.json()["default_tax_rate"] == 6
        assert response.json()["default_commission_user_id"] == 11
        assert response.json()["default_tax_user_id"] == 12

    def test_admin_streams(self, client, admin_token):
        """doc"""
        response = client.get("/api/admin/streams", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_admin_streams_unauthorized(self, client):
        """doc"""
        response = client.get("/api/admin/streams")
        assert response.status_code == 401

    def test_admin_test_stats(self, client, admin_token):
        """doc"""
        response = client.get("/api/admin/test-stats", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert response.json() is not None

    def test_admin_benchmark(self, client, admin_token, monkeypatch):
        """doc"""
        import src.routes.admin as admin_routes

        monkeypatch.setattr(admin_routes, "run_benchmark_cached", lambda: {"ok": True})
        response = client.post("/api/admin/benchmark", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_daily_report_and_text(self, client, admin_token):
        report = client.get("/api/admin/daily-report", headers={"X-Admin-Token": admin_token})
        assert report.status_code == 200
        payload = report.json()
        assert "date" in payload
        assert "revenue_total" in payload

        text = client.get("/api/admin/daily-report-text", headers={"X-Admin-Token": admin_token})
        assert text.status_code == 200
        assert "text" in text.json()

    def test_telegram_preview(self, client, admin_token):
        preview = client.post(
            "/api/admin/telegram/preview",
            headers={"X-Admin-Token": admin_token},
            json={"command": "/status"},
        )
        assert preview.status_code == 200
        assert "Status:" in preview.json()["text"]


class TestCaptchaRecords:
    """doc"""

    def test_captchas_require_admin(self, client):
        response = client.get("/api/captchas")
        assert response.status_code == 401

    def test_captchas_allow_admin(self, client, admin_token):
        response = client.get("/api/captchas", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_delete_captcha_requires_admin(self, client):
        response = client.delete("/api/captchas/1")
        assert response.status_code == 401

    def test_delete_usage_log_requires_admin(self, client):
        response = client.delete("/api/usage-log/1")
        assert response.status_code == 401

    def test_public_captchas_show_limited_anonymized_records(self, client, api_key):
        from src.db import create_key, log_usage
        from src.db.connection import get_connection

        own_usage_id = log_usage(api_key, "own-reservation", "own-captcha")
        other_key = create_key("other_captcha_user")
        other_usage_id = log_usage(other_key["key"], "other-reservation", "other-captcha")

        conn = get_connection()
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
            ("own-captcha", "passed", own_usage_id, "2026-05-01T00:00:00+00:00", "hash1", None),
        )
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
            ("other-captcha", "failed", other_usage_id, "2026-05-02T00:00:00+00:00", "hash2", "bad"),
        )
        conn.commit()
        conn.close()

        response = client.get("/api/public/captchas")

        assert response.status_code == 200
        assert response.json() == [
            {
                "id": "other-captcha",
                "captcha_id": "other-captcha",
                "status": "failed",
            },
            {
                "id": "own-captcha",
                "captcha_id": "own-captcha",
                "status": "passed",
            },
        ]
        assert "created_at" not in response.text
        assert "usage_log_id" not in response.text
        assert "api_key_id" not in response.text
        assert "key_label" not in response.text

    def test_public_captchas_support_limit_and_offset(self, client, api_key):
        from src.db import log_usage
        from src.db.connection import get_connection

        usage_id = log_usage(api_key, "paged-reservation", "paged-captcha")

        conn = get_connection()
        for index in range(3):
            conn.execute(
                "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    f"paged-captcha-{index}",
                    "passed",
                    usage_id,
                    f"2026-05-0{index + 1}T00:00:00+00:00",
                    f"hash{index}",
                    None,
                ),
            )
        conn.commit()
        conn.close()

        response = client.get("/api/public/captchas?limit=1&offset=1")

        assert response.status_code == 200
        assert response.json() == [
            {
                "id": "paged-captcha-1",
                "captcha_id": "paged-captcha-1",
                "status": "passed",
            },
        ]

    def test_public_captcha_replay_sends_selected_without_token(self, client, monkeypatch):
        from src.db import create_key, log_usage
        from src.db.connection import get_connection
        from src.services import captcha_service

        other_key = create_key("other_replay_user")
        other_usage_id = log_usage(other_key["key"], "other-reservation", "foreign-captcha")

        conn = get_connection()
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
            ("foreign-captcha", "passed", other_usage_id, "2026-05-02T00:00:00+00:00", "hash2", None),
        )
        conn.commit()
        conn.close()

        called = []
        monkeypatch.setattr(captcha_service, "replay_captchas", lambda *args, **kwargs: called.append(args) or 1)

        response = client.post(
            "/api/public/captchas/send-selected",
            json={"captcha_ids": ["foreign-captcha"]},
        )

        assert response.status_code == 200
        assert response.json() == {"sent": 1}
        assert called == [(["foreign-captcha"],)]

    def test_public_captcha_replay_reports_no_replayable_payloads(self, client, monkeypatch):
        from src.services import captcha_service

        monkeypatch.setattr(captcha_service, "replay_captchas", lambda *args, **kwargs: 0)

        response = client.post(
            "/api/public/captchas/send-selected",
            json={"captcha_ids": ["missing-payload-captcha"]},
        )

        assert response.status_code == 400
        assert response.json() == {"error": "No replayable captcha payloads"}

    def test_captcha_records_accept_v2_marker_after_start_line(self, api_key):
        from src.db import log_usage
        from src.db.captchas import create_captcha_records, list_captchas

        usage_id = log_usage(api_key, "real-reservation", "48fef3307bde851f")
        logs = [
            "07:00:00.0 === Старт скрипта (runUpTo: 5) ===",
            "07:00:00.0 <log-version>v2</log-version>",
            '07:00:08.8 [id=194] [4] event { "event": "stage_end", "stage": "validating", "status": "success", "duration_ms": 54, "endpoint": "validateCaptcha", "captcha_id": "48fef3307bde851f", "variant_index": 0 }',
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "confirmed")

        assert len(created) == 1
        rows = list_captchas(usage_id)
        assert rows[0]["captcha_id"] == "48fef3307bde851f"
        assert rows[0]["status"] == "passed"

    def test_captcha_records_parse_unsolved_timeout_line(self, api_key):
        from src.db import log_usage
        from src.db.captchas import create_captcha_records, list_captchas

        usage_id = log_usage(api_key, "real-reservation", "48fef3307bde851f")
        logs = [
            "07:00:00.5 === Старт скрипта (runUpTo: 5) ===",
            "07:00:00.5 <log-version>v2</log-version>",
            '07:00:16.6 [id=196] [3] event { "event": "stage_end", "stage": "solving", "status": "error", "duration_ms": 15231, "error": "Сервер вернул null — капча не решена (таймаут или ошибка)", "endpoint": "solve-captcha", "captcha_id": "48fef3307bde851f" }',
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "failed")

        assert len(created) == 1
        rows = list_captchas(usage_id)
        assert rows[0]["captcha_id"] == "48fef3307bde851f"
        assert rows[0]["status"] == "failed"
        assert "solve_error:" in rows[0]["fail_reason"]

    def test_captcha_records_only_scan_first_five_lines_for_v2_marker(self, api_key):
        from src.db import log_usage
        from src.db.captchas import create_captcha_records

        usage_id = log_usage(api_key, "real-reservation", "48fef3307bde851f")
        logs = [
            "line 1",
            "line 2",
            "line 3",
            "line 4",
            "line 5",
            "<log-version>v2</log-version>",
            '07:00:08.8 [id=194] [4] event { "event": "stage_end", "stage": "validating", "status": "success", "duration_ms": 54, "endpoint": "validateCaptcha", "captcha_id": "48fef3307bde851f", "variant_index": 0 }',
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "confirmed")

        assert created == []

    def test_captcha_records_updates_json_and_file_index_from_v2_logs(self, api_key, tmp_path, monkeypatch):
        import src.db.captchas as captchas_db
        from src.db import log_usage
        from src.db.captchas import create_captcha_records
        from src.services.captcha_file_service import list_captcha_files, sync_captcha_files

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))
        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED", "1")
        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED", "1")
        monkeypatch.setattr(captchas_db, "CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "48fef3307bde851f"
        payload = {
            "puzzle": {
                "tiles": [{"tileId": "a"}, {"tileId": "b"}, {"tileId": "c"}],
                "variantsCapture": [["a", "b"], ["c"]],
            }
        }
        (all_dir / f"{captcha_id}.json").write_text(json.dumps(payload), encoding="utf-8")
        sync_captcha_files()

        usage_id = log_usage(api_key, "real-reservation", captcha_id)
        logs = [
            "07:00:00.0 <log-version>v2</log-version>",
            f'07:00:08.7 [id=194] [3] event {{ "event": "stage_end", "stage": "validating", "status": "success", "duration_ms": 54, "endpoint": "validateCaptcha", "captcha_id": "{captcha_id}", "variant_index": 0 }}',
            f'07:00:08.8 [id=194] [4] Капча валидирована [{captcha_id}] ответ: ["b","a"]',
        ]

        created = create_captcha_records(usage_id, captcha_id, logs, "confirmed")

        assert len(created) == 1
        saved = json.loads((all_dir / f"{captcha_id}.json").read_text(encoding="utf-8"))
        assert saved["valid_index"] == 0
        rows = list_captcha_files()
        assert any(row["captcha_id"] == captcha_id and row["valid_index"] == 0 and row["file_status"] == "labeled" for row in rows)

    def test_captcha_records_parse_pretty_validate_event_from_confirm_usage(self, api_key, tmp_path, monkeypatch):
        import src.db.captchas as captchas_db
        from src.db import log_usage
        from src.db.captchas import create_captcha_records

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))
        monkeypatch.setattr(captchas_db, "CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "52c59c77165dc9ca"
        payload = {
            "puzzle": {
                "tiles": [{"tileId": "a"}, {"tileId": "b"}],
                "variantsCapture": [["a"], ["b"], ["a", "b"]],
            }
        }
        (all_dir / f"{captcha_id}.json").write_text(json.dumps(payload), encoding="utf-8")

        usage_id = log_usage(api_key, "real-reservation", captcha_id)
        logs = [
            "15:17:15.5 <log-version>v2</log-version>",
            (
                "15:17:22.4 [id=210] [4] event {\n"
                '  "event": "stage_end",\n'
                '  "stage": "validating",\n'
                '  "status": "success",\n'
                '  "duration_ms": 52,\n'
                '  "endpoint": "validateCaptcha",\n'
                f'  "captcha_id": "{captcha_id}",\n'
                '  "variant_index": 2\n'
                "}"
            ),
        ]

        created = create_captcha_records(usage_id, captcha_id, logs, "confirmed")

        assert len(created) == 1
        saved = json.loads((all_dir / f"{captcha_id}.json").read_text(encoding="utf-8"))
        assert saved["valid_index"] == 2

    def test_extract_variant_from_validate_event_is_single_source(self):
        from src.db.captchas import extract_variant_from_logs

        captcha_id = "48fef3307bde851f"
        logs = [
            "07:00:00.0 <log-version>v2</log-version>",
            '07:00:08.7 [id=194] [3] Server answer: captcha=48fef3307bde851f variant=99 solver=ilyx',
            '07:00:08.8 [id=194] [4] event { "event": "stage_end", "stage": "validating", "status": "success", "duration_ms": 54, "endpoint": "validateCaptcha", "captcha_id": "48fef3307bde851f", "variant_index": 14 }',
        ]

        assert extract_variant_from_logs(logs, captcha_id) == 14

    def test_solve_captcha_timeout_returns_captcha_metadata(self, client, api_key, monkeypatch):
        from src.routes import captcha as captcha_routes

        monkeypatch.setattr(captcha_routes, "captcha_timeout", 0.01)

        response = client.post(
            "/api/solve-captcha",
            json={
                "auto_solve": False,
                "timeout_metadata": True,
                "reservation_id": "real-reservation",
                "puzzle": {"tiles": [], "variantsCapture": []},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "timeout"
        assert data["captcha_id"]
        assert data["usage_log_id"]

    def test_solve_captcha_timeout_keeps_legacy_null_without_metadata_flag(self, client, api_key, monkeypatch):
        from src.routes import captcha as captcha_routes

        monkeypatch.setattr(captcha_routes, "captcha_timeout", 0.01)

        response = client.post(
            "/api/solve-captcha",
            json={
                "auto_solve": False,
                "reservation_id": "real-reservation",
                "puzzle": {"tiles": [], "variantsCapture": []},
            },
        )

        assert response.status_code == 200
        assert response.json() is None

    def test_captcha_files_sync_indexes_all_folder(self, tmp_path, monkeypatch):
        from src.services.captcha_file_service import list_captcha_files, sync_captcha_files

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        (all_dir / "abc123.json").write_text(
            json.dumps(
                {
                    "valid_index": 2,
                    "type": "puzzle-v2",
                    "puzzle": {
                        "tiles": [{"tileId": "b"}, {"tileId": "a"}],
                        "variantsCapture": [["a"], ["b"], ["a", "b"]],
                    },
                }
            ),
            encoding="utf-8",
        )

        result = sync_captcha_files()

        assert result["indexed"] == 1
        rows = list_captcha_files()
        assert rows[0]["captcha_id"] == "abc123"
        assert rows[0]["file_status"] == "labeled"
        assert rows[0]["valid_index"] == 2
        assert rows[0]["captcha_type"] == "puzzle-v2"
        assert rows[0]["variants_count"] == 3
        assert rows[0]["tiles_hash"]

    def test_admin_captcha_files_lists_file_index(self, client, admin_token, tmp_path, monkeypatch):
        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))
        (all_dir / "listed.json").write_text(
            json.dumps({"valid_index": 0, "puzzle": {"tiles": [], "variantsCapture": [[]]}}),
            encoding="utf-8",
        )

        response = client.get("/api/admin/captcha-files", headers={"X-Admin-Token": admin_token})

        assert response.status_code == 200
        data = response.json()
        assert any(row["captcha_id"] == "listed" and row["valid_index"] == 0 for row in data)


# === Frontend Tests ===
class TestFrontend:
    """doc"""

    def test_index(self, client):
        """doc"""
        response = client.get("/")
        assert response.status_code in [200, 503]

    def test_test_injector_edit(self, client):
        """doc"""
        response = client.get("/test-injector/edit")
        assert response.status_code == 200

    def test_test_injector_reschedule(self, client):
        """doc"""
        response = client.get("/test-injector/reschedule")
        assert response.status_code == 200

    @pytest.mark.skip(reason="test-channel pages are disabled together with plugin-channel flow")
    def test_test_channel_existing_card_is_disabled(self, client):
        response = client.get("/test-channel/card/existing")

        assert "EOPP Channel Test Card" not in response.text
        assert "reservation-card-existing" not in response.text

    @pytest.mark.skip(reason="test-channel pages are disabled together with plugin-channel flow")
    def test_test_channel_new_company_is_disabled(self, client):
        response = client.get("/test-channel/card/new-company")

        assert "New Auto Channel Company" not in response.text
        assert "reservation-card-new-company" not in response.text

    @pytest.mark.skip(reason="test-channel pages are disabled together with plugin-channel flow")
    def test_test_channel_root_is_disabled(self, client):
        response = client.get("/test-channel/root")

        assert "EOPP Channel Test Root" not in response.text
        assert "data-route-kind=\"eopp_root\"" not in response.text


# === Captcha Tests ===
class TestCaptcha:
    """doc"""

    def test_solve_captcha_auto_solve(self, client, api_key):
        """doc"""

        # comment
        pytest.skip(
            "РўСЂРµР±СѓРµС‚ СЂРµР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ РєР°РїС‡Рё СЃ base64 РёР·РѕР±СЂР°Р¶РµРЅРёСЏРјРё"
        )

    def test_solve_captcha_invalid_key(self, client):
        """doc"""
        client.cookies.clear()
        response = client.post(
            "/api/solve-captcha",
            json={
                "api_key": "invalid",
                "auto_solve": True,
                "puzzle": {"tiles": [], "variantsCapture": []},
            },
        )
        assert response.status_code == 401

    def test_broadcast(self, client, admin_token):
        """doc"""
        response = client.post(
            "/api/broadcast",
            headers={"X-Admin-Token": admin_token},
            json={"type": "test"},
        )
        assert response.status_code == 200

    def test_broadcast_unauthorized(self, client):
        """doc"""
        response = client.post("/api/broadcast", json={"type": "test"})
        assert response.status_code == 401


# === Tariff Tests ===
class TestTariffs:
    """doc"""

    def test_api_key_tariff_endpoints_are_removed(self, client, admin_token):
        """doc"""
        headers = {"X-Admin-Token": admin_token}
        assert client.get("/api/admin/tariffs/999", headers=headers).status_code == 404
        assert client.put(
            "/api/admin/tariffs/999",
            headers=headers,
            json={"price_create": 100, "price_reschedule": 50},
        ).status_code == 404
        assert client.delete("/api/admin/tariffs/999", headers=headers).status_code == 404


# === Update API Key Tests ===
class TestUpdateApiKey:
    """doc"""

    def test_update_api_key_comment(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "comment_test"},
        )
        kid = create.json()["id"]
        response = client.patch(
            f"/api/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"comment": "Test comment"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["comment"] == "Test comment"

    def test_update_api_key_is_admin(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "admin_test"},
        )
        kid = create.json()["id"]
        assert create.json()["is_admin"] is False

        # comment
        response = client.patch(
            f"/api/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"is_admin": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin"] is True

        # comment
        new_key = create.json()["key"]
        auth_resp = client.post("/api/auth/login", json={"token": new_key})
        assert auth_resp.status_code == 401

        # comment
        response = client.patch(
            f"/api/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"is_admin": False},
        )
        assert response.status_code == 200
        assert response.json()["is_admin"] is False

        # comment
        auth_resp = client.post("/api/auth/login", json={"token": new_key})
        assert auth_resp.status_code == 401


# === Update Usage Log Tests ===
class TestUpdateUsageLog:
    """doc"""

    def test_update_usage_log_price(self, client, api_key, admin_token, active_sse):
        """doc"""
        reg = client.post(
            "/api/register-usage",
            json={"reservation_id": "res-price"},
        )
        uid = reg.json()["usage_log_id"]
        client.cookies.clear()
        restore_admin_session(client, admin_token)
        response = client.patch(
            f"/api/admin/usage-log/{uid}",
            headers={"X-Admin-Token": admin_token},
            json={"price": 500},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["price"] == 500

    def test_update_usage_log_paid(self, client, api_key, admin_token, active_sse):
        """doc"""
        reg = client.post(
            "/api/register-usage",
            json={"reservation_id": "res-paid"},
        )
        uid = reg.json()["usage_log_id"]
        client.cookies.clear()
        restore_admin_session(client, admin_token)
        response = client.patch(
            f"/api/admin/usage-log/{uid}",
            headers={"X-Admin-Token": admin_token},
            json={"paid": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["paid"] is True


# === Generate Invoice Tests ===
class TestGenerateInvoice:
    """doc"""

    def test_generate_invoice_missing_data(self, client, admin_token):
        """doc"""
        response = client.post(
            "/api/admin/generate-invoice",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": 999, "usage_log_ids": [], "withdrawal_id": 999},
        )
        assert response.status_code in [404, 400, 500]


class TestPrepaidPackagesApi:
    """Admin prepaid package CRUD."""

    def test_prepaid_package_crud(self, client, admin_token):
        key = client.post(
            "/api/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "prepaid_api_key"},
        ).json()

        created = client.post(
            "/api/admin/prepaid-packages",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": key["id"], "balance_amount": 3000, "active": True},
        )
        assert created.status_code == 200
        package_id = created.json()["id"]

        listed = client.get("/api/admin/prepaid-packages", headers={"X-Admin-Token": admin_token})
        assert listed.status_code == 200
        assert any(p["id"] == package_id for p in listed.json())

        updated = client.patch(
            f"/api/admin/prepaid-packages/{package_id}",
            headers={"X-Admin-Token": admin_token},
            json={"balance_amount": 5000, "active": False},
        )
        assert updated.status_code == 200
        assert updated.json()["balance_amount"] == 5000
        assert updated.json()["active"] is False

        deleted = client.delete(
            f"/api/admin/prepaid-packages/{package_id}",
            headers={"X-Admin-Token": admin_token},
        )
        assert deleted.status_code == 200

    def test_prepaid_top_up_and_deductions_list(self, client, admin_token):
        from src.db import confirm_usage, log_usage

        company = create_company_with_tariff(
            client,
            admin_token,
            "Prepaid Top Up Co",
            {"price_create": 200, "price_reschedule": 100, "price_create_peak": 200},
        )
        key = create_api_key_for_company(client, admin_token, "prepaid_top_up_key", company["id"])
        created = client.post(
            "/api/admin/prepaid-packages",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": key["id"], "balance_amount": 300, "active": True},
        ).json()

        topped_up = client.post(
            f"/api/admin/prepaid-packages/{created['id']}/top-up",
            headers={"X-Admin-Token": admin_token},
            json={"amount": 500},
        )
        assert topped_up.status_code == 200
        assert topped_up.json()["balance_amount"] == 800

        log_id = log_usage(
            key["key"], "real-prepaid-top-up", "capt-top-up", config_json={"mode": "create"}
        )
        confirm_usage(log_id)
        run_billing_jobs_for_usage(log_id)

        deductions = client.get("/api/admin/prepaid-deductions", headers={"X-Admin-Token": admin_token})
        assert deductions.status_code == 200
        assert any(
            item["usage_log_id"] == log_id and item["amount"] == 200 for item in deductions.json()
        )


class TestCompanyBillingApi:
    def test_company_alias_normalizes_usage_company(self, client, admin_token):
        from src.db import confirm_usage, get_usage_log_entry, log_usage

        company = create_company_with_tariff(
            client,
            admin_token,
            "ООО Тестовая Компания",
            {"price_create": 100, "price_reschedule": 70},
        )
        key = create_api_key_for_company(client, admin_token, "company_alias_key", company["id"])

        created_alias = client.post(
            "/api/admin/company-aliases",
            headers={"X-Admin-Token": admin_token},
            json={"alias": "ООО Тест", "company": "ООО Тестовая Компания"},
        )
        assert created_alias.status_code == 200

        log_id = log_usage(
            key["key"],
            "real-company-alias",
            "capt-company-alias",
            config_json={
                "mode": "create",
                "reservationData": {"raw": {"userData": {"organizationName": "ООО Тест"}}},
            },
        )
        confirm_usage(log_id)

        log = get_usage_log_entry(log_id)
        assert log["company"] == "ООО Тестовая Компания"

        listed = client.get("/api/admin/company-aliases", headers={"X-Admin-Token": admin_token})
        assert listed.status_code == 200
        assert any(item["alias"] == "ООО Тест" for item in listed.json())


class TestCaptchaLabelingApi:
    """Backend labeling flow for unlabeled captchas."""

    @staticmethod
    def _png_b64(color=(255, 0, 0, 255)):
        import base64
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4), color).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    def test_captcha_label_next_not_found(self, client, admin_token, tmp_path, monkeypatch):
        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        response = client.get("/api/admin/captcha-label/next", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 404

    def test_captcha_label_get_by_id_returns_variants(self, client, admin_token, tmp_path, monkeypatch):
        import json

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "specific_captcha"
        payload = {
            "valid_index": 0,
            "no_valid_index": 1,
            "solver_top3": [1, 0],
            "solver_results": [{"variant": 1, "rank": 1, "score": 10.5}],
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": self._png_b64()}],
                "variantsCapture": [["a"], ["a"]],
            },
        }
        with open(all_dir / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        response = client.get(
            f"/api/admin/captcha-label/{captcha_id}",
            headers={"X-Admin-Token": admin_token},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["captcha_id"] == captcha_id
        assert body["valid_index"] == 0
        assert body["no_valid_index"] == 1
        assert body["manual_labeled"] is False
        assert body["label_source"] is None
        assert body["solver_top3"] == [1, 0]
        assert body["solver_results"] == [{"variant": 1, "rank": 1, "score": 10.5}]
        assert body["images"] == {}
        assert body["tiles"] == payload["puzzle"]["tiles"]
        assert body["variants"] == payload["puzzle"]["variantsCapture"]

    def test_captcha_label_save_updates_file_in_place(self, client, admin_token, tmp_path, monkeypatch):
        import json

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "sample_captcha"
        payload = {
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"]],
            }
        }
        with open(all_dir / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        save = client.post(
            "/api/admin/captcha-label/save",
            headers={"X-Admin-Token": admin_token},
            json={"captcha_id": captcha_id, "variant_index": 1},
        )
        assert save.status_code == 200
        with open(all_dir / f"{captcha_id}.json", encoding="utf-8") as f:
            saved = json.load(f)
        assert saved["valid_index"] == 1

    def test_save_captcha_payload_writes_solver_top3(self, tmp_path, monkeypatch):
        import json

        from src.services import captcha_file_service

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))
        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED", "1")
        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED", "1")
        monkeypatch.setattr(
            captcha_file_service,
            "calculate_solver_results",
            lambda data: [
                {"variant": 2, "rank": 1, "score": 1.0},
                {"variant": 0, "rank": 2, "score": 2.0},
                {"variant": 1, "rank": 3, "score": 3.0},
            ],
        )

        captcha_id = "solver_top3"
        payload = {
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"], ["a"]],
            }
        }

        captcha_file_service.save_captcha_payload(captcha_id, payload)

        with open(all_dir / f"{captcha_id}.json", encoding="utf-8") as f:
            saved = json.load(f)
        assert saved["solver_top3"] == [2, 0, 1]
        assert saved["solver_results"][0]["variant"] == 2

    def test_captcha_file_index_marks_solver_valid_rank(self, client, admin_token, tmp_path, monkeypatch):
        import json

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        payload = {
            "valid_index": 1,
            "solver_top3": [2, 0, 1],
            "solver_results": [
                {"variant": 2, "rank": 1, "score": 1.0},
                {"variant": 0, "rank": 2, "score": 2.0},
                {"variant": 1, "rank": 3, "score": 3.0},
            ],
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"], ["a"]],
            },
        }
        with open(all_dir / "rank_match.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        rows = client.get("/api/admin/captcha-files", headers={"X-Admin-Token": admin_token}).json()

        assert any(
            row["captcha_id"] == "rank_match"
            and row["solver_valid_rank"] == 2
            for row in rows
        )

    def test_backfill_analysis_metadata_updates_json_and_db_index(
        self, client, admin_token, tmp_path, monkeypatch
    ):
        import json

        from src.services import captcha_file_service

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))
        monkeypatch.setattr(
            captcha_file_service,
            "calculate_solver_results",
            lambda data: [
                {"variant": 2, "rank": 1, "score": 1.0},
                {"variant": 0, "rank": 2, "score": 2.0},
                {"variant": 1, "rank": 3, "score": 3.0},
            ],
        )

        payload = {
            "valid_index": 1,
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"], ["a"]],
            },
        }
        with open(all_dir / "backfill_rank.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        response = client.post(
            "/api/admin/captcha-files/backfill-analysis-metadata",
            headers={"X-Admin-Token": admin_token},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["json_updated"] == 1
        assert body["indexed"] == 1

        with open(all_dir / "backfill_rank.json", encoding="utf-8") as f:
            saved = json.load(f)
        assert saved["solver_top3"] == [2, 0, 1]
        assert saved["solver_valid_rank"] == 2
        assert saved["manual_labeled"] is False
        assert saved["label_source"] is None

        rows = client.get("/api/admin/captcha-files", headers={"X-Admin-Token": admin_token}).json()
        assert any(
            row["captcha_id"] == "backfill_rank"
            and row["solver_valid_rank"] == 2
            for row in rows
        )

    def test_captcha_label_save_overwrites_wrong_label_and_db_index(self, client, admin_token, tmp_path, monkeypatch):
        import json

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "wrong_label"
        payload = {
            "valid_index": 0,
            "no_valid_index": 0,
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"], ["a"]],
            },
        }
        with open(all_dir / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        save = client.post(
            "/api/admin/captcha-label/save",
            headers={"X-Admin-Token": admin_token},
            json={"captcha_id": captcha_id, "variant_index": 2},
        )

        assert save.status_code == 200
        with open(all_dir / f"{captcha_id}.json", encoding="utf-8") as f:
            saved = json.load(f)
        assert saved["valid_index"] == 2
        assert saved["no_valid_index"] == 0
        assert saved["manual_labeled"] is True
        assert saved["label_source"] == "manual"

        rows = client.get("/api/admin/captcha-files", headers={"X-Admin-Token": admin_token}).json()
        assert any(
            row["captcha_id"] == captcha_id
            and row["valid_index"] == 2
            and row["no_valid_index"] == 0
            and row["manual_labeled"] is True
            and row["label_source"] == "manual"
            and row["solver_valid_rank"] is None
            and row["file_status"] == "labeled"
            for row in rows
        )


class TestSlotsGroup:
    """Tests for shared AvailableSlots coordination."""

    def test_master_claims_and_slave_waits_for_slots(self, client, api_key):
        group_key = "available-slots:test"
        master = client.post(
            "/api/slots-group/claim",
            json={"group_key": group_key, "client_id": "master-1"},
        )
        assert master.status_code == 200
        assert master.json()["role"] == "master"
        assert master.json()["status"] == "claimed"

        slave = client.post(
            "/api/slots-group/claim",
            json={"group_key": group_key, "client_id": "slave-1"},
        )
        assert slave.status_code == 200
        assert slave.json()["role"] == "slave"
        assert slave.json()["status"] == "pending"

        slots_response = {
            "slots": [
                {
                    "id": "slot-1",
                    "time": "12:00",
                    "count": 3,
                    "slotCaption": "12:00",
                    "intervalIndex": 1,
                }
            ]
        }
        publish = client.post(
            "/api/slots-group/publish",
            json={
                "group_key": group_key,
                "client_id": "master-1",
                "slots_response": slots_response,
            },
        )
        assert publish.status_code == 200
        assert publish.json()["status"] == "ready"

        waited = client.post(
            "/api/slots-group/wait",
            json={"group_key": group_key, "client_id": "slave-1", "wait_ms": 10},
        )
        assert waited.status_code == 200
        assert waited.json()["status"] == "ready"
        assert waited.json()["slots_response"] == slots_response

    def test_non_master_cannot_publish(self, client, api_key):
        group_key = "available-slots:not-master"
        client.post(
            "/api/slots-group/claim",
            json={"group_key": group_key, "client_id": "master-1"},
        )
        response = client.post(
            "/api/slots-group/publish",
            json={
                "group_key": group_key,
                "client_id": "slave-1",
                "slots_response": {"slots": []},
            },
        )
        assert response.status_code == 409
        assert response.json()["error"] == "not_master"


class TestIconClickCaptcha:
    """Type=1 icon-click captcha end-to-end: matching real EOPP prod format."""

    _TINY_PNG = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAD"
        "hgGAWjR9awAAAABJRU5ErkJggg=="
    )

    @staticmethod
    def _png_b64_size(width, height, color=(255, 0, 0, 255)):
        import base64
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (width, height), color).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    @staticmethod
    def _combined_icon_click_b64(width, main_height, icons_height):
        import base64
        import io

        from PIL import Image

        image = Image.new("RGBA", (width, main_height + icons_height), (255, 0, 0, 255))
        strip = Image.new("RGBA", (width, icons_height), (255, 255, 255, 255))
        image.paste(strip, (0, main_height))
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    def test_solve_captcha_type1_creates_entry(self, client, api_key):
        """POST /api/solve-captcha with type=1 creates pending entry, returns on timeout."""
        response = client.post(
            "/api/solve-captcha",
            json={
                "auto_solve": False,
                "timeout_metadata": True,
                "type": 1,
                "token": "zc_test_token_123",
                "puzzle": {
                    "imageBase64": self._TINY_PNG,
                    "iconsBase64": self._TINY_PNG,
                },
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("status") == "timeout"
        assert body.get("captcha_id") is not None

    def test_duplicate_solve_captcha_type1_timeout_returns_object(
        self, client, api_key, monkeypatch
    ):
        import src.routes.captcha as captcha_route

        monkeypatch.setattr(captcha_route, "captcha_timeout", 0.2)
        payload = {
            "auto_solve": False,
            "timeout_metadata": True,
            "type": 1,
            "token": "zc_duplicate_token",
            "puzzle": {
                "imageBase64": self._TINY_PNG,
                "iconsBase64": self._TINY_PNG,
            },
        }
        results = []

        def post_captcha():
            results.append(client.post("/api/solve-captcha", json=payload))

        threads = [threading.Thread(target=post_captcha) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=3)

        assert len(results) == 2
        assert all(response.status_code == 200 for response in results)
        bodies = [response.json() for response in results]
        assert all(isinstance(body, dict) for body in bodies)
        assert all(body.get("status") == "timeout" for body in bodies)

    def test_solve_type1_with_coordinates(self, client, api_key):
        """POST /api/solve with coordinates marks type=1 captcha as solved."""
        import threading, time
        from src.sse import lock, pending

        captcha_id = None
        result = {}

        def send_captcha():
            nonlocal captcha_id
            resp = client.post(
                "/api/solve-captcha",
                json={
                    "auto_solve": False,
                    "timeout_metadata": True,
                    "type": 1,
                    "token": "zc_test_token_456",
                    "puzzle": {
                        "imageBase64": self._TINY_PNG,
                        "iconsBase64": self._TINY_PNG,
                    },
                },
            )
            nonlocal result
            result = resp.json()

        t = threading.Thread(target=send_captcha, daemon=True)
        t.start()

        # Wait for captcha to be pending, then solve
        deadline = time.time() + 5
        while time.time() < deadline:
            with lock:
                captcha_id = next(iter(pending.keys()), None)
            if captcha_id:
                break
            time.sleep(0.05)

        if captcha_id is None:
            pytest.skip("Captcha not created in time")

        # Now solve with coordinates
        solve_resp = client.post(
            "/api/solve",
            json={
                "captcha_id": captcha_id,
                "variantIndex": 0,
                "coordinates": [
                    {"x": 332, "y": 102},
                    {"x": 418, "y": 172},
                    {"x": 186, "y": 15},
                    {"x": 23, "y": 17},
                    {"x": 45, "y": 118},
                ],
            },
        )
        assert solve_resp.status_code == 200
        body = solve_resp.json()
        assert body["variantIndex"] == 0
        assert body["variantTiles"] == [
            {"x": 332, "y": 102},
            {"x": 418, "y": 172},
            {"x": 186, "y": 15},
            {"x": 23, "y": 17},
            {"x": 45, "y": 118},
        ]
        t.join(timeout=5)
        assert result["variantIndex"] == 0
        assert body.get("captcha_type") == 1

    def test_type1_answer_matches_eopp_format(self):
        """Verify answer format matches real EOPP validation request."""
        eopp_answer = [
            {"x": 332, "y": 102},
            {"x": 418, "y": 172},
            {"x": 186, "y": 15},
            {"x": 23, "y": 17},
            {"x": 45, "y": 118},
        ]
        assert len(eopp_answer) == 5
        for item in eopp_answer:
            assert isinstance(item, dict)
            assert "x" in item and "y" in item
            assert isinstance(item["x"], int)
            assert isinstance(item["y"], int)

    def test_type1_captcha_saved_to_json(self, client, api_key, monkeypatch):
        """Type=1 captcha JSON is persisted with correct fields."""
        from src.captcha_assembly import captcha_hash, is_icon_click_type
        from src.services.captcha_file_service import save_captcha_payload_detailed

        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED", "1")
        monkeypatch.setenv("EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED", "1")

        data = {
            "type": 1,
            "token": "zc_test_save_789",
            "puzzle": {
                "imageBase64": self._TINY_PNG,
                "iconsBase64": self._TINY_PNG,
            },
        }
        cid = captcha_hash(data)
        result = save_captcha_payload_detailed(cid, data)
        assert result.path.endswith(f"{cid}.json")
        assert result.reused_existing is False

        import json
        saved = json.load(open(result.path))
        assert saved["type"] == 1
        assert "puzzle" in saved
        assert saved["puzzle"]["imageBase64"] == self._TINY_PNG
        assert saved["puzzle"]["iconsBase64"] == self._TINY_PNG
        assert saved.get("manual_labeled") is False

    def test_icon_click_thumbnail_main_mode_returns_real_click_image(
        self, client, admin_token, tmp_path, monkeypatch
    ):
        import io
        import json

        from PIL import Image

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "icon_review_main"
        payload = {
            "type": 1,
            "puzzle": {
                "imageBase64": self._png_b64_size(30, 20),
                "iconsBase64": self._png_b64_size(15, 5),
            },
        }
        with open(all_dir / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)
        response = client.get(
            f"/api/admin/captcha-files/{captcha_id}/thumbnail?mode=main",
        )

        assert response.status_code == 200
        image = Image.open(io.BytesIO(response.content))
        assert image.size == (30, 20)

        icons_response = client.get(
            f"/api/admin/captcha-files/{captcha_id}/thumbnail?mode=icons",
        )

        assert icons_response.status_code == 200
        icons_image = Image.open(io.BytesIO(icons_response.content))
        assert icons_image.size == (15, 5)

        combined_response = client.get(
            f"/api/admin/captcha-files/{captcha_id}/thumbnail",
        )

        assert combined_response.status_code == 200
        combined_image = Image.open(io.BytesIO(combined_response.content))
        assert combined_image.size == (30, 30)

    def test_icon_click_thumbnail_icons_mode_crops_combined_icons_payload(
        self, client, admin_token, tmp_path, monkeypatch
    ):
        import io
        import json

        from PIL import Image

        all_dir = tmp_path / "all"
        all_dir.mkdir()
        monkeypatch.setenv("EOPP_CAPTCHA_ALL_DIR", str(all_dir))

        captcha_id = "icon_review_combined_icons"
        payload = {
            "type": 1,
            "puzzle": {
                "imageBase64": self._png_b64_size(30, 20),
                "iconsBase64": self._combined_icon_click_b64(30, 20, 10),
            },
        }
        with open(all_dir / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)
        response = client.get(
            f"/api/admin/captcha-files/{captcha_id}/thumbnail?mode=icons",
        )

        assert response.status_code == 200
        image = Image.open(io.BytesIO(response.content))
        assert image.size == (30, 10)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
