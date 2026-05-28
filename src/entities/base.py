import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.constants import PROJECT_DIR

_DB_PATH: str | None = None
_engine = None
_session_factory: sessionmaker[Session] | None = None


def _get_db_path() -> str:
    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = os.environ.get("EOPP_DB_PATH") or os.path.join(
            PROJECT_DIR, "data", "api_keys.db"
        )
    return _DB_PATH


def set_db_path(path: str) -> None:
    global _DB_PATH, _engine, _session_factory
    _DB_PATH = path
    _engine = None
    _session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        from sqlalchemy.pool import StaticPool
        _engine = create_engine(
            f"sqlite:///{_get_db_path()}",
            future=True,
            echo=False,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _session_factory


def get_session() -> Session:
    return get_session_factory()()


class Base(DeclarativeBase):
    pass
