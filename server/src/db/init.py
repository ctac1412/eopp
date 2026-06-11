"""
EOPP Captcha Solver - Database Initialization.

Инициализация БД через alembic migrations.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config

import src.db.connection as conn_module


def init_db():
    """Запускает alembic upgrade head для применения всех миграций."""
    db_path = conn_module.DB_PATH

    # Убеждаемся, что директория БД существует
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Alembic требует, чтобы cwd был в корне проекта
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
