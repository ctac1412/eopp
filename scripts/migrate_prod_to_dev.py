"""
Миграция данных из продакшен-БД в новую dev-БД с alembic.

Копирует данные из prod копии в новую БД, учитывая изменения схемы:
- withdrawals удалена (данные не копируются)
- Новые таблицы (invoices, users, expenses, payouts и т.д.) остаются пустыми
"""

import os
import sys

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))

import sqlite3

PROD_DB = "server/data/api_keys.db"
DEV_DB = "data/api_keys_new.db"


def migrate():
    # 1. Применяем alembic миграцию для создания новой схемы
    import os

    os.environ["EOPP_DB_PATH"] = DEV_DB
    from src.db.init import init_db

    init_db()
    print("✅ Новая схема создана через alembic")

    # 2. Подключаемся к обеим БД
    prod = sqlite3.connect(PROD_DB)
    prod.row_factory = sqlite3.Row
    dev = sqlite3.connect(DEV_DB)

    # 3. Мигрируем api_keys
    prod_keys = prod.execute("SELECT * FROM api_keys").fetchall()
    print(f"\n📦 api_keys: {len(prod_keys)} записей")
    for k in prod_keys:
        cols = dict(k)
        placeholders = ", ".join(f":{c}" for c in cols)
        dev.execute(
            f"INSERT OR REPLACE INTO api_keys ({', '.join(cols.keys())}) VALUES ({placeholders})",
            cols,
        )
    dev.commit()
    print("  ✅ api_keys скопированы")

    # 4. Мигрируем tariffs
    prod_tariffs = prod.execute("SELECT * FROM tariffs").fetchall()
    print(f"\n📦 tariffs: {len(prod_tariffs)} записей")
    for t in prod_tariffs:
        cols = dict(t)
        placeholders = ", ".join(f":{c}" for c in cols)
        dev.execute(
            f"INSERT OR REPLACE INTO tariffs ({', '.join(cols.keys())}) VALUES ({placeholders})",
            cols,
        )
    dev.commit()
    print("  ✅ tariffs скопированы")

    # 5. Мигрируем usage_log
    prod_logs = prod.execute("SELECT * FROM usage_log").fetchall()
    print(f"\n📦 usage_log: {len(prod_logs)} записей")
    if prod_logs:
        # Получаем колонки из prod
        prod_cols = dict(prod_logs[0]).keys()
        # Получаем колонки из dev
        dev_cols = [r[1] for r in dev.execute("PRAGMA table_info(usage_log)").fetchall()]

        # Находим общие колонки (исключаем id для INSERT)
        common = [c for c in prod_cols if c in dev_cols and c != "id"]
        print(f"  Общие колонки (кроме id): {common}")

        for log in prod_logs:
            row = dict(log)
            # Вставляем без id (чтобы AUTOINCREMENT работал)
            insert_cols = [c for c in common if c != "id"]
            vals = {c: row[c] for c in insert_cols}
            placeholders = ", ".join(f":{c}" for c in insert_cols)
            dev.execute(
                f"INSERT INTO usage_log ({', '.join(insert_cols)}) VALUES ({placeholders})",
                vals,
            )
        dev.commit()
        print("  ✅ usage_log скопированы")

    # 6. withdrawals — пропускаем (удалена из схемы)
    prod_withdrawals = prod.execute("SELECT COUNT(*) FROM withdrawals").fetchone()[0]
    print(f"\n📦 withdrawals: {prod_withdrawals} записей — ⏭️ пропущено (таблица удалена)")

    # 7. Итог
    print("\n📊 Итого в новой БД:")
    for table in ["api_keys", "tariffs", "usage_log"]:
        count = dev.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count}")

    prod.close()
    dev.close()
    print("\n✅ Миграция завершена")


if __name__ == "__main__":
    migrate()
