"""Validate that Alembic migrations produce the ORM-declared SQLite schema."""

from __future__ import annotations

import argparse
import importlib
import os
import pkgutil
import sqlite3
import sys
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config

SERVER_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SERVER_DIR.parent


def _ensure_import_path() -> None:
    server_path = str(SERVER_DIR)
    if server_path not in sys.path:
        sys.path.insert(0, server_path)


def _import_entities() -> None:
    _ensure_import_path()
    import src.entities as entities_pkg

    for module in pkgutil.iter_modules(entities_pkg.__path__):
        if module.name.startswith("_") or module.name in {"base", "utils"}:
            continue
        importlib.import_module(f"src.entities.{module.name}")


def _expected_columns() -> dict[str, set[str]]:
    _import_entities()
    from src.entities.base import Base

    return {
        table_name: set(table.columns.keys())
        for table_name, table in Base.metadata.tables.items()
        if table_name != "sqlite_sequence"
    }


def _actual_columns(db_path: Path) -> dict[str, set[str]]:
    conn = sqlite3.connect(db_path)
    try:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        return {
            row[0]: {column[1] for column in conn.execute(f"PRAGMA table_info({row[0]})")}
            for row in tables
        }
    finally:
        conn.close()


def _run_migrations(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    previous = os.environ.get("EOPP_DB_PATH")
    os.environ["EOPP_DB_PATH"] = str(db_path).replace("\\", "/")
    try:
        cfg = Config(str(SERVER_DIR / "alembic.ini"))
        command.upgrade(cfg, "heads")
    finally:
        if previous is None:
            os.environ.pop("EOPP_DB_PATH", None)
        else:
            os.environ["EOPP_DB_PATH"] = previous


def find_schema_drift(db_path: Path | None = None) -> list[str]:
    """Return schema drift findings between ORM metadata and migrated SQLite DB."""
    if db_path is None:
        with tempfile.TemporaryDirectory(prefix="eopp-schema-check-") as tmp:
            migrated_db = Path(tmp) / "api_keys.db"
            _run_migrations(migrated_db)
            return find_schema_drift(migrated_db)

    expected = _expected_columns()
    actual = _actual_columns(db_path)

    findings: list[str] = []
    for table_name, columns in sorted(expected.items()):
        if table_name not in actual:
            findings.append(f"missing table: {table_name}")
            continue
        missing = sorted(columns - actual[table_name])
        if missing:
            findings.append(f"missing columns in {table_name}: {', '.join(missing)}")
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="Existing SQLite DB to inspect. Defaults to a temporary DB migrated from base.",
    )
    args = parser.parse_args(argv)

    findings = find_schema_drift(args.db)
    if findings:
        print("Schema drift detected:")
        for finding in findings:
            print(f"  - {finding}")
        return 1

    print("Schema matches ORM metadata.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
