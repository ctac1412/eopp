"""
Alembic env.py для чистого sqlite3 (без SQLAlchemy ORM).

Использует alembic Operations API с прямым sqlite3 соединением.
Путь к БД берётся из EOPP_DB_PATH или из alembic.ini.
"""

import os
from logging.config import fileConfig

from alembic import context

# Alembic Config object
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def _get_db_path() -> str:
    """Получить путь к БД из env или alembic.ini."""
    env_path = os.environ.get("EOPP_DB_PATH")
    if env_path:
        return env_path

    # Из alembic.ini: sqlite:///data/api_keys.db
    url = config.get_main_option("sqlalchemy.url")
    if url and url.startswith("sqlite:///"):
        return url[len("sqlite:///") :]

    return "data/api_keys.db"


def run_migrations_offline() -> None:
    """Offline mode — генерирует SQL без подключения к БД."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online mode — запускает миграции на реальной БД через sqlite3."""
    db_path = _get_db_path()

    # Alembic ожидает SQLAlchemy-совместимый connectable.
    # Для sqlite3 оборачиваем в create_engine сdialect='sqlite'
    # но чтобы не тянуть ORM, используем sqlite3 напрямую через
    # alembic's GenericEngineAdapter.
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    engine = create_engine(
        f"sqlite:///{db_path}",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
