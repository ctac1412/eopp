"""Shared migrated SQLite template for integration tests."""

from __future__ import annotations

import os
import shutil
import tempfile
import threading
from pathlib import Path

from alembic import command
from alembic.config import Config

_TEMPLATE_LOCK = threading.Lock()
_TEMPLATE_DB: str | None = None


def _build_template_db() -> str:
    fd, template_db = tempfile.mkstemp(suffix=".template.db")
    os.close(fd)

    server_root = Path(__file__).resolve().parents[1]
    cfg = Config(str(server_root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{template_db}")
    previous_db_path = os.environ.get("EOPP_DB_PATH")
    os.environ["EOPP_DB_PATH"] = template_db
    try:
        command.upgrade(cfg, "heads")
    finally:
        if previous_db_path is None:
            os.environ.pop("EOPP_DB_PATH", None)
        else:
            os.environ["EOPP_DB_PATH"] = previous_db_path
    return template_db


def copy_migrated_db() -> str:
    """Return a fresh writable copy of the fully migrated test database."""

    global _TEMPLATE_DB
    with _TEMPLATE_LOCK:
        if _TEMPLATE_DB is None or not os.path.exists(_TEMPLATE_DB):
            _TEMPLATE_DB = _build_template_db()

    fd, test_db = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    shutil.copyfile(_TEMPLATE_DB, test_db)
    return test_db


def use_isolated_migrated_db(monkeypatch) -> str:
    """Point runtime DB helpers at a copied migrated database."""

    import src.constants as constants_module
    import src.db.connection as conn_module
    from src.entities.base import set_db_path

    test_db = copy_migrated_db()
    monkeypatch.setenv("EOPP_DB_PATH", test_db)
    monkeypatch.setattr(constants_module, "DB_PATH", test_db)
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    monkeypatch.setattr(conn_module, "DB_DIR", os.path.dirname(test_db))
    monkeypatch.setenv("EOPP_AUTO_MIGRATE", "0")
    set_db_path(test_db)
    return test_db


def cleanup_db_file(db_path: str) -> None:
    """Release SQLAlchemy pools and remove SQLite files created by a test."""

    try:
        from src.entities import base as entity_base

        if entity_base._engine is not None:
            entity_base._engine.dispose()
    except Exception:
        pass

    for suffix in ("", "-wal", "-shm"):
        path = f"{db_path}{suffix}"
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
