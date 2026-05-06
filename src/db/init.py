"""
EOPP Captcha Solver - Database Initialization.

Создание таблиц и миграции.
"""

from datetime import UTC, datetime

from src.constants import ADMIN_TOKEN
from src.db.connection import get_connection


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            usage_count INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            comment TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER NOT NULL,
            reservation_id TEXT NOT NULL,
            captcha_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            error_stage TEXT,
            slot_date TEXT,
            created_at TEXT NOT NULL,
            confirmed_at TEXT,
            price INTEGER,
            paid INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tariffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER UNIQUE NOT NULL,
            price_create INTEGER NOT NULL,
            price_reschedule INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            percent INTEGER NOT NULL,
            requisites TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    _add_column(conn, "usage_log", "slot_date", "TEXT")
    _add_column(conn, "usage_log", "logs", "TEXT")
    _add_column(conn, "usage_log", "config_json", "TEXT")
    _add_column(conn, "usage_log", "price", "INTEGER")
    _add_column(conn, "usage_log", "paid", "INTEGER")
    _add_column(conn, "api_keys", "comment", "TEXT")

    now = datetime.now(UTC).isoformat()
    conn.execute(
        "INSERT OR IGNORE INTO api_keys (key, label, created_at, max_uses, active) VALUES (?, ?, ?, NULL, 1)",
        (ADMIN_TOKEN, "admin", now),
    )
    conn.commit()
    conn.close()


def _add_column(conn, table, column, type_):
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {type_}")
        conn.commit()
    except Exception:
        pass
