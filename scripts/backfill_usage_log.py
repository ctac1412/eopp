"""
Backfill денормализованных полей в usage_log из config_json.

Читает существующие записи usage_log, парсит config_json и заполняет:
- op_type, company, fio, vehicle_number, is_test
"""

import json
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_UUID_V0_PATTERN = re.compile(r"^0{8}-0{4}-0{4}-0{4}-0{12}$")

DEV_DB = "data/api_keys_dev.db"


def extract_fields(config_json: dict | None) -> dict:
    if not config_json:
        return {"op_type": None, "company": None, "fio": None, "vehicle_number": None}
    op_type = config_json.get("mode")
    company = (
        config_json.get("reservationData", {})
        .get("raw", {})
        .get("userData", {})
        .get("organizationName")
    )
    fio = config_json.get("reservationData", {}).get("raw", {}).get("userData", {}).get("fio")
    vehicle_number = None
    vehicles = config_json.get("reservationData", {}).get("raw", {}).get("vehicleData", [])
    if isinstance(vehicles, list):
        for v in vehicles:
            if isinstance(v, dict) and v.get("subTypeId") == 1:
                vehicle_number = v.get("regNumber") or None
                break
    return {
        "op_type": op_type,
        "company": company,
        "fio": fio,
        "vehicle_number": vehicle_number,
    }


def calc_is_test(reservation_id: str, config_json: dict | None) -> int:
    if reservation_id in ("unknown", "") or _UUID_V0_PATTERN.match(reservation_id):
        return 1
    if (
        config_json
        and isinstance(config_json.get("runUpTo"), int)
        and config_json.get("runUpTo") < 5
    ):
        return 1
    return 0


def backfill():
    conn = sqlite3.connect(DEV_DB)
    conn.row_factory = sqlite3.Row

    # Читаем все записи где op_type IS NULL (ещё не backfill-ены)
    rows = conn.execute(
        "SELECT id, reservation_id, config_json FROM usage_log WHERE op_type IS NULL"
    ).fetchall()

    print(f"📦 Найдено {len(rows)} записей для backfill")

    updated = 0
    stats = {"op_type": {}, "company": 0, "fio": 0, "vehicle": 0, "is_test": 0}

    for row in rows:
        config = json.loads(row["config_json"]) if row["config_json"] else None
        fields = extract_fields(config)
        is_test = calc_is_test(row["reservation_id"], config)

        conn.execute(
            """UPDATE usage_log
               SET op_type = ?, company = ?, fio = ?, vehicle_number = ?, is_test = ?
               WHERE id = ?""",
            (
                fields["op_type"],
                fields["company"],
                fields["fio"],
                fields["vehicle_number"],
                is_test,
                row["id"],
            ),
        )
        updated += 1

        # Статистика
        ot = fields["op_type"] or "unknown"
        stats["op_type"][ot] = stats["op_type"].get(ot, 0) + 1
        if fields["company"]:
            stats["company"] += 1
        if fields["fio"]:
            stats["fio"] += 1
        if fields["vehicle_number"]:
            stats["vehicle"] += 1
        if is_test:
            stats["is_test"] += 1

    conn.commit()

    print(f"\n✅ Обновлено {updated} записей")
    print("\n📊 Статистика:")
    print(f"  op_type: {stats['op_type']}")
    print(f"  company: {stats['company']}")
    print(f"  fio: {stats['fio']}")
    print(f"  vehicle_number: {stats['vehicle']}")
    print(f"  is_test: {stats['is_test']}")

    # Проверка
    remaining = conn.execute("SELECT COUNT(*) FROM usage_log WHERE op_type IS NULL").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM usage_log").fetchone()[0]
    print(f"\n📊 Итого: {total} записей, {remaining} ещё без op_type")

    conn.close()


if __name__ == "__main__":
    backfill()
