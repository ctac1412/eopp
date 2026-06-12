"""
EOPP Captcha Solver - Database Initialization.

Initializes the SQLite database through Alembic migrations.
"""

import os
from pathlib import Path

from alembic import command
from alembic.config import Config

import src.db.connection as conn_module


def init_db():
    """Run Alembic migrations unless production delivery disabled auto-migrate.

    Phase 9 deploys run migrations explicitly before starting the candidate app.
    EOPP_AUTO_MIGRATE=0 protects production startup from mutating the SQLite
    schema during health checks or rollbacks. Local/dev keeps the legacy
    auto-upgrade behavior by default.
    """
    if os.environ.get("EOPP_AUTO_MIGRATE", "1") == "0":
        return

    db_path = conn_module.DB_PATH

    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    project_root = Path(__file__).parent.parent.parent
    alembic_ini = project_root / "alembic.ini"

    cfg = Config(str(alembic_ini))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    try:
        command.upgrade(cfg, "heads")
    except Exception as exc:
        raise RuntimeError(
            f"Database migration failed for {db_path}. "
            f"Check alembic history and the error above for details."
        ) from exc
