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

    try:
        cfg = Config(str(alembic_ini))
        cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
        command.upgrade(cfg, "head")
    except Exception:
        # Fallback: если alembic не установлен или ошибка —
        # это не критично, сервер продолжит работу
        pass
