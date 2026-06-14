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
