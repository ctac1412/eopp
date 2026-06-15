import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from scripts.check_migration_schema import find_schema_drift

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = PROJECT_ROOT / "server"
MAKEFILE = PROJECT_ROOT / "Makefile"


def _columns(db_path: Path, table_name: str) -> set[str]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    finally:
        conn.close()
    return {row[1] for row in rows}


def test_migrations_repair_head_database_missing_inserted_user_column(tmp_path, monkeypatch):
    db_path = tmp_path / "api_keys.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        conn.execute("INSERT INTO alembic_version (version_num) VALUES ('k4l5m6n7o8p9')")
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("EOPP_DB_PATH", str(db_path).replace("\\", "/"))
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    command.upgrade(cfg, "heads")

    assert "is_director" in _columns(db_path, "users")


def test_unified_profiles_migration_uses_existing_art_trans_company(tmp_path, monkeypatch):
    db_path = tmp_path / "api_keys.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                aliases TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                login TEXT,
                password_hash TEXT,
                role TEXT NOT NULL,
                active INTEGER NOT NULL,
                company_id INTEGER,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                label TEXT,
                user_id INTEGER,
                company_id INTEGER,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE operators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT,
                nickname TEXT,
                company_id INTEGER
            )
            """
        )
        conn.execute(
            """
            INSERT INTO companies (name, aliases, notes, created_at, updated_at)
            VALUES ('ООО "АРТ-ТРАНС"', NULL, NULL, '2026-01-01T00:00:00+00:00', NULL)
            """
        )
        company_id = conn.execute("SELECT id FROM companies WHERE name = 'ООО \"АРТ-ТРАНС\"'").fetchone()[0]
        conn.execute(
            "INSERT INTO api_keys (key, label, user_id, company_id, created_at) VALUES (?, ?, NULL, NULL, ?)",
            ("key-without-company", "Key", "2026-01-01T00:00:00+00:00"),
        )
        conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        conn.execute("INSERT INTO alembic_version (version_num) VALUES ('c4d5e6f7g8h9')")
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("EOPP_DB_PATH", str(db_path).replace("\\", "/"))
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    command.upgrade(cfg, "d5e6f7g8h9i0")

    conn = sqlite3.connect(db_path)
    try:
        companies = conn.execute("SELECT id, name FROM companies ORDER BY id").fetchall()
        api_key_company_id = conn.execute(
            "SELECT company_id FROM api_keys WHERE key = 'key-without-company'"
        ).fetchone()[0]
    finally:
        conn.close()

    assert companies == [(company_id, 'ООО "АРТ-ТРАНС"')]
    assert api_key_company_id == company_id


def test_schema_checker_reports_model_columns_missing_from_existing_db(tmp_path):
    db_path = tmp_path / "api_keys.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        conn.commit()
    finally:
        conn.close()

    findings = find_schema_drift(db_path)

    assert any(
        finding.startswith("missing columns in users:") and "is_director" in finding
        for finding in findings
    )


def test_operator_billing_mode_migration_backfills_from_icon_rate(tmp_path, monkeypatch):
    db_path = tmp_path / "api_keys.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE operators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL,
                nickname TEXT NOT NULL,
                created_at TEXT NOT NULL,
                icon_rate INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            "INSERT INTO operators (uuid, nickname, created_at, icon_rate) VALUES (?, ?, ?, ?)",
            ("company-mode", "Company", "2026-01-01T00:00:00+00:00", 0),
        )
        conn.execute(
            "INSERT INTO operators (uuid, nickname, created_at, icon_rate) VALUES (?, ?, ?, ?)",
            ("custom-mode", "Custom", "2026-01-01T00:00:00+00:00", 75),
        )
        conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
        conn.execute("INSERT INTO alembic_version (version_num) VALUES ('o8p9q0r1s2t3')")
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("EOPP_DB_PATH", str(db_path).replace("\\", "/"))
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    command.upgrade(cfg, "heads")

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT uuid, billing_mode FROM operators ORDER BY uuid").fetchall()
    finally:
        conn.close()

    assert rows == [("company-mode", "company"), ("custom-mode", "custom")]


def test_schema_checker_accepts_fresh_database_after_all_migrations():
    assert find_schema_drift() == []


def test_run_prod_targets_apply_migrations_before_server_start():
    makefile = MAKEFILE.read_text(encoding="utf-8")

    assert "run-prod: build-frontend build-extension prepare-prod-db" in makefile
    assert "run-prod-start: build-frontend build-extension prepare-prod-db" in makefile
    assert "$(MAKE) schema-check" in makefile
    assert "$(MAKE) migrate" in makefile
    assert "$(MAKE) schema-check-db" in makefile
    assert "uv run python -m alembic upgrade heads" in makefile
    assert 'scripts/check_migration_schema.py --db "$(if $(DB),$(DB),data/api_keys.db)"' in makefile
