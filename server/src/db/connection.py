"""
EOPP Captcha Solver - Database Connection.

SQLite подключение и инициализация базы данных.
"""

import os
import sqlite3

from src.constants import DB_PATH, PROJECT_DIR

DB_DIR = os.path.dirname(DB_PATH) or os.path.join(PROJECT_DIR, "data")


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(zip(row.keys(), row))


def get_connection():
    db_dir = os.path.dirname(DB_PATH) or DB_DIR
    os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
