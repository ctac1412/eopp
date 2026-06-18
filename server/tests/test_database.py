"""
EOPP Captcha Solver - Database Unit Tests

Р СџР С•Р В»Р Р…РЎвЂ№Р в„– Р Р…Р В°Р В±Р С•РЎР‚ РЎвЂљР ВµРЎРѓРЎвЂљР С•Р Р† Р вЂР вЂќ:
- TestAPIKeysDB - CRUD Р С•Р С—Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РЎРѓ Р С”Р В»РЎР‹РЎвЂЎР В°Р СР С‘
- TestValidateKey - Р Р†Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р С”Р В»РЎР‹РЎвЂЎР ВµР в„–
- TestUsageLog - Р В»Р С•Р С–Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ
- TestAdminKey - Р В°Р Т‘Р СР С‘Р Р…РЎРѓР С”Р С‘Р в„– Р С”Р В»РЎР‹РЎвЂЎ
- TestEdgeCases - Р С–РЎР‚Р В°Р Р…Р С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎРѓР В»РЎС“РЎвЂЎР В°Р С‘
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest

from db_template import cleanup_db_file, use_isolated_migrated_db


@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
    """РР·РѕР»РёСЂСѓРµРј Р‘Р” РґР»СЏ РєР°Р¶РґРѕРіРѕ С‚РµСЃС‚Р°."""
    test_db = use_isolated_migrated_db(monkeypatch)

    yield

    cleanup_db_file(test_db)


def attach_key_to_company_tariff(
    key_id: int,
    company_name: str,
    *,
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
    price_custom_slots: int | None = None,
) -> int:
    from datetime import UTC, datetime

    from src.db.connection import get_connection

    now = datetime.now(UTC).isoformat()
    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", (company_name, now))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("UPDATE api_keys SET company_id = ? WHERE id = ?", (company_id, key_id))
    conn.execute(
        """
        INSERT INTO company_tariffs (
            company_id, price_create, price_reschedule, price_create_peak,
            price_custom_slots, executor_amount, operator_amount, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
        """,
        (
            company_id,
            price_create,
            price_reschedule,
            price_create_peak,
            price_custom_slots,
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return company_id


def drain_background_jobs(max_rounds: int = 10) -> None:
    from src.platform.jobs.worker import default_registry, run_due_jobs

    registry = default_registry()
    for _ in range(max_rounds):
        result = run_due_jobs(registry=registry, max_jobs=50, max_attempts=1)
        if result.processed == 0:
            return
    raise AssertionError("background jobs did not drain")


class TestAPIKeysDB:
    """CRUD Р С•Р С—Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РЎРѓ API Р С”Р В»РЎР‹РЎвЂЎР В°Р СР С‘."""

    def test_create_key(self):
        """Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С‘Р Вµ Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import create_key

        key = create_key(label="test", max_uses=10)
        assert key["label"] == "test"
        assert key["max_uses"] == 10
        assert key["active"] is True
        assert "key" in key

    def test_list_keys(self):
        """Р РЋР С—Р С‘РЎРѓР С•Р С” Р С”Р В»РЎР‹РЎвЂЎР ВµР в„–."""
        from src.db import create_key, list_keys

        create_key(label="key1")
        create_key(label="key2")
        keys = list_keys()
        assert len(keys) >= 2

    def test_update_key(self):
        """Р С›Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import create_key, update_key

        key = create_key(label="original")
        updated = update_key(key["id"], label="updated", active=False)
        assert updated["label"] == "updated"
        assert updated["active"] is False

    def test_update_key_comment(self):
        """Р С›Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р С”Р С•Р СР СР ВµР Р…РЎвЂљР В°РЎР‚Р С‘РЎРЏ."""
        from src.db import create_key, update_key

        key = create_key(label="comment_test")
        updated = update_key(key["id"], comment="Test comment")
        assert updated["comment"] == "Test comment"

    def test_delete_key(self):
        """Р Р€Р Т‘Р В°Р В»Р ВµР Р…Р С‘Р Вµ Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import create_key, delete_key, list_keys

        key = create_key(label="to_delete")
        assert delete_key(key["id"]) is True
        keys = list_keys()
        assert not any(k["id"] == key["id"] for k in keys)

    def test_get_key_by_id(self):
        """Р СџР С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р С”Р В»РЎР‹РЎвЂЎР В° Р С—Р С• ID."""
        from src.db import create_key, get_key_by_id

        key = create_key(label="lookup")
        found = get_key_by_id(key["id"])
        assert found["label"] == "lookup"

    def test_get_key_by_id_not_found(self):
        """Р СџР С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import get_key_by_id

        assert get_key_by_id(99999) is None


class TestValidateKey:
    """Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р С”Р В»РЎР‹РЎвЂЎР ВµР в„–."""

    def test_validate_valid_key(self):
        """Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р Р†Р В°Р В»Р С‘Р Т‘Р Р…Р С•Р С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import create_key, validate_key

        key = create_key(label="valid")
        result = validate_key(key["key"])
        assert result["valid"] is True

    def test_validate_invalid_key(self):
        """Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import validate_key

        result = validate_key("nonexistent")
        assert result["valid"] is False
        assert result["reason"] == "Key not found"

    def test_validate_disabled_key(self):
        """Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р Р…Р С•Р С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import create_key, update_key, validate_key

        key = create_key(label="disabled")
        update_key(key["id"], active=False)
        result = validate_key(key["key"])
        assert result["valid"] is False
        assert result["reason"] == "Key is disabled"

    def test_validate_exhausted_key(self):
        """Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р С”Р В»РЎР‹РЎвЂЎР В° РЎРѓ Р С‘РЎРѓРЎвЂЎР ВµРЎР‚Р С—Р В°Р Р…Р Р…РЎвЂ№Р С Р В»Р С‘Р СР С‘РЎвЂљР С•Р С."""
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
    """Р вЂєР С•Р С–Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""

    def test_log_usage(self):
        """Р В Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""
        from src.db import create_key, log_usage

        key = create_key(label="usage_test")
        log_id = log_usage(key["key"], "res-123", "capt-123")
        assert log_id > 0

    def test_confirm_usage(self):
        """Р СџР С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘Р Вµ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""
        from src.db import confirm_usage, create_key, log_usage

        key = create_key(label="confirm_test")
        log_id = log_usage(key["key"], "res-conf", "capt-conf")
        assert confirm_usage(log_id) is True

    def test_confirm_usage_enqueues_captcha_records_from_stored_logs(self, monkeypatch):
        from src.db import confirm_usage, create_key, log_usage
        from src.db.connection import get_connection

        monkeypatch.setattr(
            "src.db.captchas.create_captcha_records",
            lambda *args, **kwargs: (_ for _ in ()).throw(
                RuntimeError("captcha records should be deferred")
            ),
        )

        logs = [
            "15:17:15.5 <log-version>v2</log-version>",
            '15:17:22.4 [id=210] [4] event { "event": "stage_end" }',
        ]
        key = create_key(label="confirm_stored_logs")
        log_id = log_usage(key["key"], "res-stored", "capt-stored")

        assert confirm_usage(log_id, logs=logs) is True

        conn = get_connection()
        row = conn.execute(
            "SELECT job_name, payload_json FROM background_jobs WHERE job_name = 'captcha_records'"
        ).fetchone()
        conn.close()
        assert row is not None
        import json as _json

        assert _json.loads(row["payload_json"]) == {
            "usage_log_id": log_id,
            "status": "confirmed",
        }

    def test_confirm_usage_with_price(self):
        """Р СџР С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘Р Вµ РЎРѓ РЎвЂ Р ВµР Р…Р С•Р в„– Р С‘Р В· РЎвЂљР В°РЎР‚Р С‘РЎвЂћР В°."""
        from src.db import (
            confirm_usage,
            create_key,
            get_usage_log_entry,
            log_usage,
        )

        key = create_key(label="price_test")
        attach_key_to_company_tariff(
            key["id"],
            "Price Test Co",
            price_create=100,
            price_reschedule=50,
        )
        log_id = log_usage(key["key"], "res-price", "capt-price", config_json={"mode": "create"})
        confirm_usage(log_id)
        log = get_usage_log_entry(log_id)
        assert log["price"] == 100

    def test_confirm_usage_reschedule_price(self):
        """Р СџР С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘Р Вµ Р С—Р ВµРЎР‚Р ВµР Р…Р С•РЎРѓР В° РЎРѓ РЎвЂ Р ВµР Р…Р С•Р в„–."""
        from src.db import (
            confirm_usage,
            create_key,
            get_usage_log_entry,
            log_usage,
        )

        key = create_key(label="reschedule_price")
        attach_key_to_company_tariff(
            key["id"],
            "Reschedule Price Co",
            price_create=100,
            price_reschedule=75,
        )
        log_id = log_usage(
            key["key"], "res-resched", "capt-resched", config_json={"mode": "reschedule"}
        )
        confirm_usage(log_id)
        log = get_usage_log_entry(log_id)
        assert log["price"] == 75

    def test_confirm_usage_links_company_to_open_invoice(self):
        """Р СџР С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р Р…РЎвЂ№Р в„– usage Р С”Р С•Р СР С—Р В°Р Р…Р С‘Р С‘ Р В°Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘ Р С—Р С•Р С—Р В°Р Т‘Р В°Р ВµРЎвЂљ Р Р† Р С•РЎвЂљР С”РЎР‚РЎвЂ№РЎвЂљРЎвЂ№Р в„– РЎРѓРЎвЂЎР ВµРЎвЂљ."""
        from src.db import confirm_usage, create_key, get_usage_log_entry, log_usage
        from src.db.invoices import ensure_open_invoice, get_open_invoice

        company = "Open Invoice Link Co"
        key = create_key(label="open_invoice_link")
        attach_key_to_company_tariff(
            key["id"],
            company,
            price_create=100,
            price_reschedule=70,
        )
        log_id = log_usage(
            key["key"],
            "res-open-link",
            "capt-open-link",
            config_json={
                "mode": "create",
                "reservationData": {
                    "raw": {"userData": {"organizationName": company}}
                },
            },
        )

        open_invoice = ensure_open_invoice(company)
        assert open_invoice is not None

        assert confirm_usage(log_id) is True
        drain_background_jobs()
        log = get_usage_log_entry(log_id)
        assert log["invoice_id"] is not None
        open_invoice = get_open_invoice(company)
        assert open_invoice is not None
        assert log["invoice_id"] == open_invoice["id"]
        assert open_invoice["is_open"] is True

    def test_fail_usage(self):
        """Р С›РЎвЂљР СР ВµРЎвЂљР С”Р В° Р С•РЎв‚¬Р С‘Р В±Р С”Р С‘."""
        from src.db import create_key, fail_usage, log_usage

        key = create_key(label="fail_test")
        log_id = log_usage(key["key"], "res-fail", "capt-fail")
        assert fail_usage(log_id, error_message="Test error", error_stage="captcha") is True

    def test_update_usage_log(self):
        """Р С›Р В±Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р В»Р С•Р С–Р В°."""
        from src.db import create_key, log_usage, update_usage_log

        key = create_key(label="update_log")
        log_id = log_usage(key["key"], "res-update", "capt-update")
        updated = update_usage_log(log_id, price=500, paid=True)
        assert updated["price"] == 500
        assert updated["paid"] is True

    def test_list_usages(self):
        """Р РЋР С—Р С‘РЎРѓР С•Р С” Р В»Р С•Р С–Р С•Р Р†."""
        from src.db import create_key, list_usages, log_usage

        key = create_key(label="list_test")
        log_usage(key["key"], "res-1", "capt-1")
        log_usage(key["key"], "res-2", "capt-2")
        usages = list_usages()
        assert len(usages) >= 2


class TestAdminKey:
    """Р С’Р Т‘Р СР С‘Р Р…РЎРѓР С”Р С‘Р в„– Р С”Р В»РЎР‹РЎвЂЎ."""

    def test_admin_key_exists(self):
        """Р С’Р Т‘Р СР С‘Р Р…РЎРѓР С”Р С‘Р в„– Р С”Р В»РЎР‹РЎвЂЎ РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“Р ВµРЎвЂљ."""
        from src.db import get_key_by_label

        admin = get_key_by_label("admin")
        assert admin is not None

    def test_admin_key_active(self):
        """Р С’Р Т‘Р СР С‘Р Р…РЎРѓР С”Р С‘Р в„– Р С”Р В»РЎР‹РЎвЂЎ Р В°Р С”РЎвЂљР С‘Р Р†Р ВµР Р…."""
        from src.db import get_key_by_label

        admin = get_key_by_label("admin")
        assert admin["active"] is True


class TestEdgeCases:
    """Р вЂњРЎР‚Р В°Р Р…Р С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎРѓР В»РЎС“РЎвЂЎР В°Р С‘."""

    def test_empty_label(self):
        """Р С™Р В»РЎР‹РЎвЂЎ РЎРѓ Р С—РЎС“РЎРѓРЎвЂљРЎвЂ№Р С Р В»Р ВµР в„–Р В±Р В»Р С•Р С."""
        from src.db import create_key

        key = create_key(label="")
        assert key["label"] == ""

    def test_max_uses_none(self):
        """Р С™Р В»РЎР‹РЎвЂЎ Р В±Р ВµР В· Р В»Р С‘Р СР С‘РЎвЂљР В°."""
        from src.db import create_key, validate_key

        key = create_key(label="unlimited", max_uses=None)
        result = validate_key(key["key"])
        assert result["valid"] is True
        assert result["remaining"] is None

    def test_usage_increment(self):
        """Р ВР Р…Р С”РЎР‚Р ВµР СР ВµР Р…РЎвЂљ РЎРѓРЎвЂЎРЎвЂРЎвЂљРЎвЂЎР С‘Р С”Р В° Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""
        from src.db import confirm_usage, create_key, increment_usage, log_usage

        key = create_key(label="increment")
        log_id = log_usage(key["key"], "res-inc", "capt-inc")
        assert increment_usage(key["key"]) is True
        confirm_usage(log_id)
        from src.db import get_key_by_id

        updated = get_key_by_id(key["id"])
        assert updated["usage_count"] >= 1

    def test_get_key_by_label_not_found(self):
        """Р СџР С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р С”Р В»РЎР‹РЎвЂЎР В° Р С—Р С• Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР СРЎС“ Р В»Р ВµР в„–Р В±Р В»РЎС“."""
        from src.db import get_key_by_label

        assert get_key_by_label("nonexistent_label") is None

    def test_delete_nonexistent_key(self):
        """Р Р€Р Т‘Р В°Р В»Р ВµР Р…Р С‘Р Вµ Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°."""
        from src.db import delete_key

        assert delete_key(99999) is False

    def test_confirm_nonexistent_usage(self):
        """Р СџР С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘Р Вµ Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР С–Р С• Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""
        from src.db import confirm_usage

        assert confirm_usage(99999) is False

    def test_fail_nonexistent_usage(self):
        """Р С›РЎвЂљР СР ВµРЎвЂљР С”Р В° Р Р…Р ВµРЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“РЎР‹РЎвЂ°Р ВµР С–Р С• Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ."""
        from src.db import fail_usage

        assert fail_usage(99999, error_message="Error", error_stage="test") is False


class TestOpenInvoices:
    """Р С›РЎвЂљР С”РЎР‚РЎвЂ№РЎвЂљРЎвЂ№Р Вµ РЎРѓРЎвЂЎР ВµРЎвЂљР В° Р С—Р С• Р С”Р С•Р СР С—Р В°Р Р…Р С‘РЎРЏР С."""

    def test_issue_open_invoice_closes_current_and_creates_new(self):
        from src.db import confirm_usage, create_key, log_usage
        from src.db.invoices import ensure_open_invoice, get_open_invoice, issue_open_invoice

        company = "РћРћРћ Issue"
        key = create_key(label="open_issue")
        attach_key_to_company_tariff(
            key["id"],
            company,
            price_create=120,
            price_reschedule=90,
        )
        ensure_open_invoice(company)
        for idx in range(2):
            log_id = log_usage(
                key["key"],
                f"res-open-{idx}",
                f"capt-open-{idx}",
                config_json={
                    "mode": "create",
                    "reservationData": {"raw": {"userData": {"organizationName": company}}},
                },
            )
            confirm_usage(log_id)
        drain_background_jobs()

        ensure_open_invoice(company)
        old_open = get_open_invoice(company)
        assert old_open is not None
        result = issue_open_invoice(company, reopen=True)
        assert result is not None
        assert result["closed_invoice"]["id"] == old_open["id"]
        assert result["closed_invoice"]["is_open"] is False
        assert result["closed_invoice"]["debt_amount"] == 240
        assert result["new_open_invoice"] is not None
        assert result["new_open_invoice"]["id"] != old_open["id"]
        assert result["new_open_invoice"]["is_open"] is True


class TestPrepaidPackages:
    """Р СџРЎР‚Р ВµР Т‘Р С•Р С—Р В»Р В°РЎвЂЎР ВµР Р…Р Р…РЎвЂ№Р Вµ Р С—Р В°Р С”Р ВµРЎвЂљРЎвЂ№ Р С‘ РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘РЎРЏ."""

    def test_prepaid_deduction_on_confirm_usage(self):
        from src.db import confirm_usage, create_key, get_usage_log_entry, log_usage
        from src.db.prepaid import create_prepaid_package, list_prepaid_packages

        key = create_key(label="prepaid")
        attach_key_to_company_tariff(
            key["id"],
            "Prepaid Co",
            price_create=100,
            price_reschedule=70,
        )
        create_prepaid_package(api_key_id=key["id"], balance_amount=500, active=True)

        log_id = log_usage(
            key["key"],
            "res-prepaid",
            "capt-prepaid",
            config_json={"mode": "create"},
        )
        confirm_usage(log_id)
        drain_background_jobs()

        log = get_usage_log_entry(log_id)
        packages = list_prepaid_packages()
        pkg = next(item for item in packages if item["api_key_id"] == key["id"])
        assert log["paid"] is True
        assert pkg["balance_amount"] == 400

    def test_prepaid_not_deducted_when_insufficient_balance(self):
        from src.db import confirm_usage, create_key, get_usage_log_entry, log_usage
        from src.db.prepaid import create_prepaid_package, list_prepaid_packages

        key = create_key(label="prepaid_low")
        attach_key_to_company_tariff(
            key["id"],
            "Prepaid Low Co",
            price_create=200,
            price_reschedule=70,
        )
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

    def test_prepaid_deduction_stops_when_balance_update_loses_race(self):
        from src.db.prepaid import deduct_prepaid_for_usage_tx

        class Cursor:
            def __init__(self, rowcount=0):
                self.rowcount = rowcount

        class FakeConn:
            def execute(self, query, params=()):
                normalized = " ".join(query.split())
                if normalized.startswith("SELECT id FROM prepaid_deductions"):
                    return type("Result", (), {"fetchone": lambda self: None})()
                if normalized.startswith("SELECT * FROM prepaid_packages"):
                    return type(
                        "Result",
                        (),
                        {
                            "fetchone": lambda self: {
                                "id": 1,
                                "balance_amount": 100,
                            }
                        },
                    )()
                if normalized.startswith("UPDATE prepaid_packages"):
                    return Cursor(rowcount=0)
                raise AssertionError(f"unexpected query after failed balance update: {query}")

        assert deduct_prepaid_for_usage_tx(FakeConn(), 1, 10, 100) is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
