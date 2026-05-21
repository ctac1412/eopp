"""
EOPP Captcha Solver - Usage Log.

Логирование использования API ключей.
"""

import json
import re
from datetime import UTC, datetime

from src.db.connection import get_connection
from src.db.tariffs import get_tariff
from src.utils import get_by_path


# UUID v0 pattern for zero UUID (used as placeholder)
_UUID_V0_PATTERN = re.compile(r"^0{8}-0{4}-0{4}-0{4}-0{12}$")


def _extract_fields_from_config(config_json: dict | None) -> dict:
    """Парсит config_json и извлекает денормализованные поля."""
    if not config_json:
        return {
            "op_type": None,
            "company": None,
            "fio": None,
            "vehicle_number": None,
        }
    op_type = config_json.get("mode")
    company = get_by_path(config_json, "reservationData", "raw", "userData", "organizationName")
    fio = get_by_path(config_json, "reservationData", "raw", "userData", "fio")
    vehicle_number = None
    vehicle_data = get_by_path(config_json, "reservationData", "raw", "vehicleData", default=[])
    if isinstance(vehicle_data, list):
        for v in vehicle_data:
            if isinstance(v, dict) and v.get("subTypeId") == 1:
                vehicle_number = v.get("regNumber") or None
                break
    return {
        "op_type": op_type,
        "company": company,
        "fio": fio,
        "vehicle_number": vehicle_number,
    }


def _is_fake_reservation(reservation_id: str) -> bool:
    """Проверяет, что reservation_id фейковый (тестовый запуск с нашего бека)."""
    return reservation_id in ("unknown", "") or bool(_UUID_V0_PATTERN.match(reservation_id))


def _calc_is_test(reservation_id: str, config_json: dict | None) -> int:
    """Вычисляет is_test по reservation_id и config_json."""
    if _is_fake_reservation(reservation_id):
        return 1
    if config_json and isinstance(config_json.get("runUpTo"), int) and config_json.get("runUpTo") < 5:
        return 1
    return 0


def get_usage_log_entry(usage_log_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "reservation_id": row["reservation_id"],
        "captcha_id": row["captcha_id"],
        "status": row["status"],
        "error_message": row["error_message"],
        "error_stage": row["error_stage"],
        "slot_date": row["slot_date"],
        "logs": json.loads(row["logs"]) if row["logs"] else None,
        "config_json": json.loads(row["config_json"]) if row["config_json"] else None,
        "created_at": row["created_at"],
        "confirmed_at": row["confirmed_at"],
        "price": row["price"],
        "paid": bool(row["paid"]) if row["paid"] is not None else None,
        # Денормализованные поля
        "op_type": row["op_type"],
        "company": row["company"],
        "fio": row["fio"],
        "vehicle_number": row["vehicle_number"],
        "is_test": bool(row["is_test"]) if row["is_test"] is not None else False,
        "invoice_id": row["invoice_id"],
    }


def delete_usage_log(usage_log_id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM usage_log WHERE id = ?", (usage_log_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def log_usage(
    api_key: str, reservation_id: str, captcha_id: str, config_json: dict | None = None
) -> int:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (api_key,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"API key not found: {api_key[:8]}...")
    now = datetime.now(UTC).isoformat()
    config_str = json.dumps(config_json) if config_json else None

    extracted = _extract_fields_from_config(config_json)
    is_test = _calc_is_test(reservation_id, config_json)

    cursor = conn.execute(
        """INSERT INTO usage_log
           (api_key_id, reservation_id, captcha_id, status, created_at, config_json,
            op_type, company, fio, vehicle_number, is_test)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)""",
        (
            row["id"], reservation_id, captcha_id, now, config_str,
            extracted["op_type"], extracted["company"], extracted["fio"],
            extracted["vehicle_number"], is_test,
        ),
    )
    conn.commit()
    usage_log_id = cursor.lastrowid
    conn.close()
    return usage_log_id


def confirm_usage(
    usage_log_id: int,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return False
    now = datetime.now(UTC).isoformat()
    logs_json = json.dumps(logs) if logs else None
    if captcha_id and captcha_id != "unknown":
        conn.execute(
            "UPDATE usage_log SET status = 'confirmed', confirmed_at = ?, slot_date = ?, logs = ?, captcha_id = ? WHERE id = ?",
            (now, slot_date, logs_json, captcha_id, usage_log_id),
        )
    else:
        conn.execute(
            "UPDATE usage_log SET status = 'confirmed', confirmed_at = ?, slot_date = ?, logs = ? WHERE id = ?",
            (now, slot_date, logs_json, usage_log_id),
        )
    config_json = json.loads(row["config_json"]) if row["config_json"] else None
    is_test = bool(row["is_test"]) if row["is_test"] else False
    if not is_test:
        mode = config_json.get("mode", "create") if config_json else "create"
        tariff = get_tariff(row["api_key_id"])
        price = 0
        if tariff:
            if mode == "reschedule":
                price = tariff["price_reschedule"]
            else:
                price = tariff["price_create"]
        conn.execute(
            "UPDATE usage_log SET price = ? WHERE id = ?",
            (price, usage_log_id),
        )
    conn.execute(
        "UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = ?",
        (row["api_key_id"],),
    )
    conn.commit()

    if captcha_id and captcha_id != "unknown" and not _is_fake_reservation(row["reservation_id"]):
        from src.db.captchas import create_captcha_records
        create_captcha_records(usage_log_id, captcha_id, logs, "confirmed")

    conn.close()
    return True


def fail_usage(
    usage_log_id: int,
    error_message: str,
    error_stage: str,
    slot_date: str | None = None,
    logs: list[str] | None = None,
    captcha_id: str | None = None,
) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return False
    logs_json = json.dumps(logs) if logs else None
    if captcha_id and captcha_id != "unknown":
        conn.execute(
            "UPDATE usage_log SET status = 'failed', error_message = ?, error_stage = ?, slot_date = ?, logs = ?, captcha_id = ? WHERE id = ?",
            (
                error_message,
                error_stage,
                slot_date,
                logs_json,
                captcha_id,
                usage_log_id,
            ),
        )
    else:
        conn.execute(
            "UPDATE usage_log SET status = 'failed', error_message = ?, error_stage = ?, slot_date = ?, logs = ? WHERE id = ?",
            (error_message, error_stage, slot_date, logs_json, usage_log_id),
        )
    conn.commit()

    if captcha_id and captcha_id != "unknown" and not _is_fake_reservation(row["reservation_id"]):
        from src.db.captchas import create_captcha_records
        create_captcha_records(usage_log_id, captcha_id, logs, "failed")

    conn.close()
    return True


def list_usages(api_key_id: int | None = None) -> list[dict]:
    conn = get_connection()
    if api_key_id is not None:
        rows = conn.execute(
            "SELECT u.*, k.label FROM usage_log u LEFT JOIN api_keys k ON u.api_key_id = k.id WHERE u.api_key_id = ? ORDER BY u.created_at DESC",
            (api_key_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT u.*, k.label FROM usage_log u LEFT JOIN api_keys k ON u.api_key_id = k.id ORDER BY u.created_at DESC"
        ).fetchall()
    conn.close()
    result = []
    for r in rows:
        logs_raw = r["logs"]
        logs = json.loads(logs_raw) if logs_raw else None
        result.append(
            {
                "id": r["id"],
                "api_key_id": r["api_key_id"],
                "reservation_id": r["reservation_id"],
                "captcha_id": r["captcha_id"],
                "status": r["status"],
                "error_message": r["error_message"],
                "error_stage": r["error_stage"],
                "slot_date": r["slot_date"],
                "logs": logs,
                "config_json": json.loads(r["config_json"]) if r["config_json"] else None,
                "created_at": r["created_at"],
                "confirmed_at": r["confirmed_at"],
                "label": r["label"],
                "price": r["price"],
                "paid": bool(r["paid"]) if r["paid"] is not None else None,
                # Денормализованные поля
                "op_type": r["op_type"],
                "company": r["company"],
                "fio": r["fio"],
                "vehicle_number": r["vehicle_number"],
                "is_test": bool(r["is_test"]) if r["is_test"] is not None else False,
                "invoice_id": r["invoice_id"],
            }
        )
    return result


def calc_debt(api_key_id: int) -> dict:
    conn = get_connection()
    rows = conn.execute(
        "SELECT price, paid FROM usage_log WHERE api_key_id = ? AND status = 'confirmed'",
        (api_key_id,),
    ).fetchall()
    conn.close()
    unpaid_count = 0
    no_price_count = 0
    unpaid_total = 0
    for r in rows:
        price = r["price"]
        paid = r["paid"]
        paid_bool = bool(paid) if paid is not None else None
        if price is None:
            no_price_count += 1
        elif paid_bool is not True:
            unpaid_count += 1
            unpaid_total += price
    return {
        "unpaid_count": unpaid_count,
        "no_price_count": no_price_count,
        "unpaid_total": unpaid_total,
    }


def update_usage_log(usage_log_id: int, price: int | None = None, paid: bool | None = None) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    if not row:
        conn.close()
        return None
    price = price if price is not None else row["price"]
    paid = paid if paid is not None else row["paid"]
    conn.execute(
        "UPDATE usage_log SET price = ?, paid = ? WHERE id = ?",
        (price, 1 if paid else 0 if paid is False else None, usage_log_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    conn.close()
    return {
        "id": row["id"],
        "api_key_id": row["api_key_id"],
        "reservation_id": row["reservation_id"],
        "captcha_id": row["captcha_id"],
        "status": row["status"],
        "error_message": row["error_message"],
        "error_stage": row["error_stage"],
        "slot_date": row["slot_date"],
        "logs": json.loads(row["logs"]) if row["logs"] else None,
        "config_json": json.loads(row["config_json"]) if row["config_json"] else None,
        "created_at": row["created_at"],
        "confirmed_at": row["confirmed_at"],
        "price": row["price"],
        "paid": bool(row["paid"]) if row["paid"] is not None else None,
        "op_type": row["op_type"],
        "company": row["company"],
        "fio": row["fio"],
        "vehicle_number": row["vehicle_number"],
        "is_test": bool(row["is_test"]) if row["is_test"] is not None else False,
        "invoice_id": row["invoice_id"],
    }
