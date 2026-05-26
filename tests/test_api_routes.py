"""
EOPP Captcha Solver - API Routes Unit Tests

РўРµСЃС‚С‹ РІСЃРµС… API СЌРЅРґРїРѕРёРЅС‚РѕРІ (Р±РµР· Р±Р»РѕРєРёСЂСѓСЋС‰РёС… SSE С‚РµСЃС‚РѕРІ).
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
    """doc"""
    import src.db.connection as conn_module
    import src.db.init as init_module
    from src.entities.base import set_db_path

    # comment
    test_db = tempfile.mktemp(suffix=".db")

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

    app = create_app(use_tests=False)
    return TestClient(app)


@pytest.fixture
def admin_token():
    """doc"""
    from src.db import list_keys

    keys = list_keys()
    admin_key = next((k for k in keys if k["is_admin"]), None)
    assert admin_key is not None, "Admin key not found in test DB"
    return admin_key["key"]


@pytest.fixture
def api_key(client, admin_token):
    """doc"""
    response = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000},
    )
    return response.json()["key"]


# === API Keys Tests ===
class TestAPIKeys:
    """doc"""

    def test_create_key(self, client, admin_token):
        """doc"""
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
        """doc"""
        client.post("/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "test2"})
        response = client.get("/api-keys", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_validate_key_includes_peak_create_price(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "validate_peak"},
        ).json()
        client.put(
            f"/admin/tariffs/{create['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 1000, "price_reschedule": 7000, "price_create_peak": 9000},
        )

        response = client.get(f"/validate-key?api_key={create['key']}")

        assert response.status_code == 200
        data = response.json()
        assert data["price_create"] == 1000
        assert data["price_reschedule"] == 7000
        assert data["price_create_peak"] == 9000

    def test_update_key(self, client, admin_token):
        """doc"""
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
        """doc"""
        create = client.post(
            "/api-keys", headers={"X-Admin-Token": admin_token}, json={"label": "del"}
        )
        kid = create.json()["id"]
        response = client.delete(f"/api-keys/{kid}", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_validate_key_valid(self, client, admin_token, api_key):
        """doc"""
        response = client.get(f"/validate-key?api_key={api_key}")
        assert response.status_code == 200
        assert response.json()["valid"] is True

    def test_validate_key_invalid(self, client):
        """doc"""
        response = client.get("/validate-key?api_key=invalid")
        assert response.status_code == 200
        assert response.json()["valid"] is False

    def test_key_status(self, client, admin_token, api_key):
        """doc"""
        response = client.get(f"/api-key-status?key={api_key}")
        assert response.status_code == 200
        data = response.json()
        assert "remaining" in data
        assert data["valid"] is True

    def test_reset_usage(self, client, admin_token):
        """doc"""
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
    """doc"""

    def test_register_usage(self, client, api_key):
        """doc"""
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
        """doc"""
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
        assert "usage_log_id" in data

    def test_confirm_usage(self, client, api_key):
        """doc"""
        # comment
        reg = client.post(
            "/register-usage",
            json={"api_key": api_key, "reservation_id": "res-conf"},
        )
        uid = reg.json()["usage_log_id"]

        # comment
        response = client.post("/confirm-usage", json={"api_key": api_key, "usage_log_id": uid})
        assert response.status_code == 200

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

        key_data = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "peak_price_key"},
        ).json()
        client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 1000, "price_reschedule": 7000, "price_create_peak": 9000},
        )
        uid = log_usage(
            api_key=key_data["key"],
            reservation_id="real-reservation-peak",
            captcha_id="unknown",
            config_json={"mode": "create"},
        )

        response = client.post(
            "/confirm-usage", json={"api_key": key_data["key"], "usage_log_id": uid}
        )

        assert response.status_code == 200
        logs = client.get(f"/usage-log?api_key={key_data['key']}").json()
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

        key_data = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "peak_fallback_key"},
        ).json()
        client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 1000, "price_reschedule": 7000, "price_create_peak": None},
        )
        uid = log_usage(
            api_key=key_data["key"],
            reservation_id="real-reservation-peak-fallback",
            captcha_id="unknown",
            config_json={"mode": "create"},
        )

        response = client.post(
            "/confirm-usage", json={"api_key": key_data["key"], "usage_log_id": uid}
        )

        assert response.status_code == 200
        logs = client.get(f"/usage-log?api_key={key_data['key']}").json()
        entry = next(item for item in logs if item["id"] == uid)
        assert entry["price"] == 7000

    def test_fail_usage(self, client, api_key):
        """doc"""
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

    def test_usage_log_requires_scope(self, client):
        """doc"""
        response = client.get("/usage-log")
        assert response.status_code == 401

    def test_usage_log_filter(self, client, api_key):
        """doc"""
        response = client.get(f"/usage-log?api_key={api_key}")
        assert response.status_code == 200

    def test_usage_log_invalid_key(self, client):
        """doc"""
        response = client.get("/usage-log?api_key=invalid")
        assert response.status_code == 403

    def test_usage_log_api_key_id_requires_admin(self, client):
        """doc"""
        response = client.get("/usage-log?api_key_id=1")
        assert response.status_code == 401

    def test_usage_log_admin_scope(self, client, admin_token):
        """doc"""
        response = client.get("/usage-log", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200


# === Mock Tests ===
class TestMock:
    """doc"""

    def test_set_mock_config(self, client, admin_token):
        """doc"""
        response = client.post(
            "/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "429"}}},
        )
        assert response.status_code == 200

    def test_get_mock_config(self, client, admin_token):
        """doc"""
        client.post(
            "/mock-config",
            headers={"X-Admin-Token": admin_token},
            json={"endpoints": {"/test": {"mode": "success"}}},
        )
        response = client.get("/mock-config")
        assert response.status_code == 200

    def test_reset_mock_config(self, client, admin_token):
        """doc"""
        response = client.delete("/mock-config", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_mock_captcha(self, client):
        """doc"""
        response = client.post(
            "/reservations-api/v1/captcha",
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
            "/reservations-api/v1/captcha-validate",
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
            "/reservations-api/v1/timeslot/AvailableSlots?facilityId=f1&date=2026-01-01"
        )
        assert response.status_code == 200
        assert "slots" in response.json()

    def test_mock_reschedule(self, client):
        """doc"""
        response = client.post("/reservations-api/v1/Reschedule", json={"reservationId": "r1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True

    def test_mock_submit_draft(self, client):
        """doc"""
        response = client.post("/reservations-api/v1/SubmitDraft", json={"facilityId": "f1"})
        assert response.status_code == 200
        assert response.json()["isSuccess"] is True


# === Admin Tests ===
class TestAdmin:
    """doc"""

    @pytest.mark.parametrize(
        "path",
        [
            "/admin/invoices",
            "/admin/expenses",
            "/admin/payouts",
            "/admin/users",
            "/admin/captchas",
            "/admin/backend-logs",
        ],
    )
    def test_admin_routes_unauthorized(self, client, path):
        response = client.get(path)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "path",
        [
            "/admin/invoices",
            "/admin/expenses",
            "/admin/payouts",
            "/admin/users",
            "/admin/captchas",
        ],
    )
    def test_admin_routes_authorized(self, client, admin_token, path):
        response = client.get(path, headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_admin_auth_success(self, client, admin_token):
        """doc"""
        response = client.post("/admin/auth", json={"token": admin_token})
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_admin_auth_fail(self, client):
        """doc"""
        response = client.post("/admin/auth", json={"token": "wrong"})
        assert response.status_code == 401

    def test_admin_auth_non_admin_key(self, client, admin_token):
        """doc"""
        # comment
        resp = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "non_admin_key"},
        )
        normal_key = resp.json()["key"]

        response = client.post("/admin/auth", json={"token": normal_key})
        assert response.status_code == 401

    def test_backend_logs_tail(self, client, admin_token, tmp_path, monkeypatch):
        log_file = tmp_path / "backend.log"
        log_file.write_text("\n".join(f"line {i}" for i in range(5)), encoding="utf-8")
        monkeypatch.setenv("EOPP_BACKEND_LOG_PATH", str(log_file))

        response = client.get(
            "/admin/backend-logs?lines=3",
            headers={"X-Admin-Token": admin_token},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 3
        assert data["lines"] == ["line 2", "line 3", "line 4"]

    def test_issue_open_invoice_for_company(self, client, admin_token):
        """doc"""
        from src.db import confirm_usage, log_usage

        created = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "api_open_issue"},
        ).json()
        client.put(
            f"/admin/tariffs/{created['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 1500, "price_reschedule": 7000},
        )
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
            "/admin/company-billing-settings/ООО API Open",
            headers={"X-Admin-Token": admin_token},
            json={"auto_invoice_reopen": True},
        )
        client.post(
            "/admin/auto-invoices/open",
            headers={"X-Admin-Token": admin_token},
            json={"company": "ООО API Open"},
        )
        confirm_usage(log_id)

        response = client.post(
            "/admin/open-invoices/issue",
            headers={"X-Admin-Token": admin_token},
            json={"company": "ООО API Open"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["closed_invoice"]["is_open"] is False
        assert data["closed_invoice"]["debt_amount"] == 1500
        assert data["new_open_invoice"]["is_open"] is True
        assert data["new_open_invoice"]["id"] != data["closed_invoice"]["id"]

    def test_admin_streams(self, client, admin_token):
        """doc"""
        response = client.get("/admin/streams", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_admin_streams_unauthorized(self, client):
        """doc"""
        response = client.get("/admin/streams")
        assert response.status_code == 401

    def test_admin_test_stats(self, client, admin_token):
        """doc"""
        response = client.get("/admin/test-stats", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200
        assert response.json() is not None

    def test_admin_benchmark(self, client, admin_token):
        """doc"""
        response = client.get("/admin/benchmark", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_daily_report_and_text(self, client, admin_token):
        report = client.get("/admin/daily-report", headers={"X-Admin-Token": admin_token})
        assert report.status_code == 200
        payload = report.json()
        assert "date" in payload
        assert "revenue_total" in payload

        text = client.get("/admin/daily-report-text", headers={"X-Admin-Token": admin_token})
        assert text.status_code == 200
        assert "text" in text.json()

    def test_telegram_preview(self, client, admin_token):
        preview = client.post(
            "/admin/telegram/preview",
            headers={"X-Admin-Token": admin_token},
            json={"command": "/status"},
        )
        assert preview.status_code == 200
        assert "Status:" in preview.json()["text"]


class TestCaptchaRecords:
    """doc"""

    def test_captchas_require_admin(self, client):
        response = client.get("/captchas")
        assert response.status_code == 401

    def test_captchas_allow_admin(self, client, admin_token):
        response = client.get("/captchas", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 200

    def test_delete_captcha_requires_admin(self, client):
        response = client.delete("/captchas/1")
        assert response.status_code == 401

    def test_delete_usage_log_requires_admin(self, client):
        response = client.delete("/usage-log/1")
        assert response.status_code == 401

    def test_public_captchas_show_limited_anonymized_records(self, client, api_key):
        from src.db import create_key, log_usage
        from src.db.connection import get_connection

        own_usage_id = log_usage(api_key, "own-reservation", "own-captcha")
        other_key = create_key("other_captcha_user")
        other_usage_id = log_usage(other_key["key"], "other-reservation", "other-captcha")

        conn = get_connection()
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, correct_answer, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("own-captcha", "passed", own_usage_id, "2026-05-01T00:00:00+00:00", "hash1", "[]", None),
        )
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, correct_answer, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("other-captcha", "failed", other_usage_id, "2026-05-02T00:00:00+00:00", "hash2", None, "bad"),
        )
        conn.commit()
        conn.close()

        response = client.get("/public/captchas")

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

    def test_public_captcha_replay_sends_selected_without_token(self, client, api_key, monkeypatch):
        from src.db import create_key, log_usage
        from src.db.connection import get_connection
        from src.services import captcha_service

        other_key = create_key("other_replay_user")
        other_usage_id = log_usage(other_key["key"], "other-reservation", "foreign-captcha")

        conn = get_connection()
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at, tiles_hash, correct_answer, fail_reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("foreign-captcha", "passed", other_usage_id, "2026-05-02T00:00:00+00:00", "hash2", "[]", None),
        )
        conn.commit()
        conn.close()

        called = []
        monkeypatch.setattr(captcha_service, "replay_captchas", lambda *args, **kwargs: called.append(args) or 1)

        response = client.post(
            "/public/captchas/send-selected",
            json={"captcha_ids": ["foreign-captcha"]},
        )

        assert response.status_code == 200
        assert response.json() == {"sent": 1}
        assert called == [(["foreign-captcha"],)]

    def test_captcha_records_accept_v2_marker_after_start_line(self, api_key):
        from src.db import log_usage
        from src.db.captchas import create_captcha_records, list_captchas

        usage_id = log_usage(api_key, "real-reservation", "48fef3307bde851f")
        logs = [
            "07:00:00.0 === Старт скрипта (runUpTo: 5) ===",
            "07:00:00.0 <log-version>v2</log-version>",
            '07:00:08.8 [id=194] [4] Капча валидирована [48fef3307bde851f] ответ: ["tile-1","tile-2"]',
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "confirmed")

        assert len(created) == 1
        rows = list_captchas(usage_id)
        assert rows[0]["captcha_id"] == "48fef3307bde851f"
        assert rows[0]["status"] == "passed"
        assert rows[0]["correct_answer"] == '["tile-1", "tile-2"]'

    def test_captcha_records_parse_unsolved_timeout_line(self, api_key):
        from src.db import log_usage
        from src.db.captchas import create_captcha_records, list_captchas

        usage_id = log_usage(api_key, "real-reservation", "48fef3307bde851f")
        logs = [
            "07:00:00.5 === Старт скрипта (runUpTo: 5) ===",
            "07:00:00.5 <log-version>v2</log-version>",
            "07:00:16.6 [id=196] [3] Капча не решена [48fef3307bde851f] причина: таймаут или ошибка",
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "failed")

        assert len(created) == 1
        rows = list_captchas(usage_id)
        assert rows[0]["captcha_id"] == "48fef3307bde851f"
        assert rows[0]["status"] == "failed"
        assert rows[0]["fail_reason"] == "таймаут или ошибка"

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
            '07:00:08.8 [id=194] [4] Капча валидирована [48fef3307bde851f] ответ: ["tile-1"]',
        ]

        created = create_captcha_records(usage_id, "48fef3307bde851f", logs, "confirmed")

        assert created == []

    def test_solve_captcha_timeout_returns_captcha_metadata(self, api_key):
        from fastapi import FastAPI

        from src.routes.captcha import register_captcha_routes

        app = FastAPI()
        register_captcha_routes(app, captcha_timeout=0.01)
        timeout_client = TestClient(app)

        response = timeout_client.post(
            "/solve-captcha",
            json={
                "api_key": api_key,
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

    def test_solve_captcha_timeout_keeps_legacy_null_without_metadata_flag(self, api_key):
        from fastapi import FastAPI

        from src.routes.captcha import register_captcha_routes

        app = FastAPI()
        register_captcha_routes(app, captcha_timeout=0.01)
        timeout_client = TestClient(app)

        response = timeout_client.post(
            "/solve-captcha",
            json={
                "api_key": api_key,
                "auto_solve": False,
                "reservation_id": "real-reservation",
                "puzzle": {"tiles": [], "variantsCapture": []},
            },
        )

        assert response.status_code == 200
        assert response.json() is None


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
        """doc"""
        response = client.post(
            "/broadcast",
            headers={"X-Admin-Token": admin_token},
            json={"type": "test"},
        )
        assert response.status_code == 200

    def test_broadcast_unauthorized(self, client):
        """doc"""
        response = client.post("/broadcast", json={"type": "test"})
        assert response.status_code == 401


# === Tariff Tests ===
class TestTariffs:
    """doc"""

    def test_get_tariff_not_found(self, client, admin_token, api_key):
        """doc"""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        response = client.get(
            f"/admin/tariffs/{key_data['id']}", headers={"X-Admin-Token": admin_token}
        )
        assert response.status_code == 404

    def test_create_tariff(self, client, admin_token, api_key):
        """doc"""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        response = client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50, "price_create_peak": 200},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["price_create"] == 100
        assert data["price_reschedule"] == 50
        assert data["price_create_peak"] == 200

        keys = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()
        listed_key = next(item for item in keys if item["id"] == key_data["id"])
        assert listed_key["tariff"]["price_create_peak"] == 200

    def test_update_tariff(self, client, admin_token, api_key):
        """doc"""
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

    def test_update_tariff_can_clear_peak_price(self, client, admin_token, api_key):
        """doc"""
        key_data = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()[0]
        client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50, "price_create_peak": 200},
        )

        response = client.put(
            f"/admin/tariffs/{key_data['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"price_create": 100, "price_reschedule": 50, "price_create_peak": None},
        )

        assert response.status_code == 200
        assert response.json()["price_create_peak"] is None

    def test_delete_tariff(self, client, admin_token, api_key):
        """doc"""
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


# === Update API Key Tests ===
class TestUpdateApiKey:
    """doc"""

    def test_update_api_key_comment(self, client, admin_token):
        """doc"""
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

    def test_update_api_key_is_admin(self, client, admin_token):
        """doc"""
        create = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "admin_test"},
        )
        kid = create.json()["id"]
        assert create.json()["is_admin"] is False

        # comment
        response = client.patch(
            f"/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"is_admin": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin"] is True

        # comment
        new_key = create.json()["key"]
        auth_resp = client.post("/admin/auth", json={"token": new_key})
        assert auth_resp.status_code == 200

        # comment
        response = client.patch(
            f"/admin/api-keys/{kid}",
            headers={"X-Admin-Token": admin_token},
            json={"is_admin": False},
        )
        assert response.status_code == 200
        assert response.json()["is_admin"] is False

        # comment
        auth_resp = client.post("/admin/auth", json={"token": new_key})
        assert auth_resp.status_code == 401


# === Update Usage Log Tests ===
class TestUpdateUsageLog:
    """doc"""

    def test_update_usage_log_price(self, client, api_key, admin_token):
        """doc"""
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
        """doc"""
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
    """doc"""

    def test_generate_invoice_missing_data(self, client, admin_token):
        """doc"""
        response = client.post(
            "/admin/generate-invoice",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": 999, "usage_log_ids": [], "withdrawal_id": 999},
        )
        assert response.status_code in [404, 400, 500]

    def test_generate_invoice_no_logs(self, client, admin_token, api_key):
        """doc"""
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


class TestPrepaidPackagesApi:
    """Admin prepaid package CRUD."""

    def test_prepaid_package_crud(self, client, admin_token):
        key = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "prepaid_api_key"},
        ).json()

        created = client.post(
            "/admin/prepaid-packages",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": key["id"], "balance_amount": 3000, "active": True},
        )
        assert created.status_code == 200
        package_id = created.json()["id"]

        listed = client.get("/admin/prepaid-packages", headers={"X-Admin-Token": admin_token})
        assert listed.status_code == 200
        assert any(p["id"] == package_id for p in listed.json())

        updated = client.patch(
            f"/admin/prepaid-packages/{package_id}",
            headers={"X-Admin-Token": admin_token},
            json={"balance_amount": 5000, "active": False},
        )
        assert updated.status_code == 200
        assert updated.json()["balance_amount"] == 5000
        assert updated.json()["active"] is False

        deleted = client.delete(
            f"/admin/prepaid-packages/{package_id}",
            headers={"X-Admin-Token": admin_token},
        )
        assert deleted.status_code == 200

    def test_prepaid_top_up_and_deductions_list(self, client, admin_token):
        from src.db import confirm_usage, create_tariff, log_usage

        key = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "prepaid_top_up_key"},
        ).json()
        create_tariff(key["id"], price_create=200, price_reschedule=100)
        created = client.post(
            "/admin/prepaid-packages",
            headers={"X-Admin-Token": admin_token},
            json={"api_key_id": key["id"], "balance_amount": 300, "active": True},
        ).json()

        topped_up = client.post(
            f"/admin/prepaid-packages/{created['id']}/top-up",
            headers={"X-Admin-Token": admin_token},
            json={"amount": 500},
        )
        assert topped_up.status_code == 200
        assert topped_up.json()["balance_amount"] == 800

        log_id = log_usage(
            key["key"], "real-prepaid-top-up", "capt-top-up", config_json={"mode": "create"}
        )
        confirm_usage(log_id)

        deductions = client.get("/admin/prepaid-deductions", headers={"X-Admin-Token": admin_token})
        assert deductions.status_code == 200
        assert any(
            item["usage_log_id"] == log_id and item["amount"] == 200 for item in deductions.json()
        )


class TestCompanyBillingApi:
    def test_company_alias_normalizes_usage_company(self, client, admin_token):
        from src.db import confirm_usage, create_tariff, get_usage_log_entry, log_usage

        key = client.post(
            "/api-keys",
            headers={"X-Admin-Token": admin_token},
            json={"label": "company_alias_key"},
        ).json()
        create_tariff(key["id"], price_create=100, price_reschedule=70)

        created_alias = client.post(
            "/admin/company-aliases",
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

        listed = client.get("/admin/company-aliases", headers={"X-Admin-Token": admin_token})
        assert listed.status_code == 200
        assert any(item["alias"] == "ООО Тест" for item in listed.json())


class TestCaptchaLabelingApi:
    """Backend labeling flow for unlabeled captchas."""

    def test_captcha_label_next_not_found(self, client, admin_token, tmp_path, monkeypatch):
        import src.routes.admin as admin_routes

        no_valid = tmp_path / "no_valid"
        valid = tmp_path / "valid"
        no_valid.mkdir()
        valid.mkdir()
        monkeypatch.setattr(admin_routes, "NO_VALID_DIR", str(no_valid))
        monkeypatch.setattr(admin_routes, "VALID_DIR", str(valid))

        response = client.get("/admin/captcha-label/next", headers={"X-Admin-Token": admin_token})
        assert response.status_code == 404

    def test_captcha_label_save_moves_file(self, client, admin_token, tmp_path, monkeypatch):
        import json

        import src.routes.admin as admin_routes

        no_valid = tmp_path / "no_valid"
        valid = tmp_path / "valid"
        no_valid.mkdir()
        valid.mkdir()
        monkeypatch.setattr(admin_routes, "NO_VALID_DIR", str(no_valid))
        monkeypatch.setattr(admin_routes, "VALID_DIR", str(valid))

        captcha_id = "sample_captcha"
        payload = {
            "puzzle": {
                "tiles": [{"tileId": "a", "imageData": ""}],
                "variantsCapture": [["a"], ["a"]],
            }
        }
        with open(no_valid / f"{captcha_id}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f)

        save = client.post(
            "/admin/captcha-label/save",
            headers={"X-Admin-Token": admin_token},
            json={"captcha_id": captcha_id, "variant_index": 1},
        )
        assert save.status_code == 200
        assert (valid / f"{captcha_id}.json").exists()
        assert not (no_valid / f"{captcha_id}.json").exists()


class TestSlotsGroup:
    """Tests for shared AvailableSlots coordination."""

    def test_master_claims_and_slave_waits_for_slots(self, client):
        group_key = "available-slots:test"
        master = client.post(
            "/slots-group/claim",
            json={"group_key": group_key, "client_id": "master-1"},
        )
        assert master.status_code == 200
        assert master.json()["role"] == "master"
        assert master.json()["status"] == "claimed"

        slave = client.post(
            "/slots-group/claim",
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
            "/slots-group/publish",
            json={
                "group_key": group_key,
                "client_id": "master-1",
                "slots_response": slots_response,
            },
        )
        assert publish.status_code == 200
        assert publish.json()["status"] == "ready"

        waited = client.post(
            "/slots-group/wait",
            json={"group_key": group_key, "client_id": "slave-1", "wait_ms": 10},
        )
        assert waited.status_code == 200
        assert waited.json()["status"] == "ready"
        assert waited.json()["slots_response"] == slots_response

    def test_non_master_cannot_publish(self, client):
        group_key = "available-slots:not-master"
        client.post(
            "/slots-group/claim",
            json={"group_key": group_key, "client_id": "master-1"},
        )
        response = client.post(
            "/slots-group/publish",
            json={
                "group_key": group_key,
                "client_id": "slave-1",
                "slots_response": {"slots": []},
            },
        )
        assert response.status_code == 409
        assert response.json()["error"] == "not_master"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
