"""
EOPP Captcha Solver - Constants and Configuration.

Константы проекта:
- PORT - порт сервера (по умолчанию: 8765)
- TEST_DIR, VALID_DIR, NO_VALID_DIR - пути к тестовым данным
- CAPTCHA_TIMEOUT - таймаут ожидания решения капчи (10 сек)

Используется во всех модулях для доступа к конфигурации.
"""

import logging
import os
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger("eopp.constants")
MOSCOW_TZ = timezone(timedelta(hours=3), "Europe/Moscow")

PORT = 8765
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAPTCHA_TIMEOUT = 10


def env_flag(name: str, default: bool = False) -> bool:
    """Read a boolean env flag by bare name or EOPP_ prefixed name."""
    raw = os.environ.get(name)
    if raw is None:
        raw = os.environ.get(f"EOPP_{name}")
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def is_peak_fast_mode() -> bool:
    """Return whether core endpoints should avoid synchronous side work now."""

    return is_peak_fast_mode_active()


def is_peak_fast_mode_active(now: datetime | None = None) -> bool:
    """Return true during forced or scheduled Moscow peak-fast windows.

    Operators normally need the fastest possible core captcha path around the
    EOPP slot-release windows. Explicit ``PEAK_FAST_MODE``/``EOPP_PEAK_FAST_MODE``
    still forces fast mode for tests and emergency operation; otherwise the
    local schedule is 09:50-10:10 and 11:50-12:10 Europe/Moscow.
    """

    if env_flag("PEAK_FAST_MODE", False):
        return True
    moscow_now = now or datetime.now(_moscow_tz())
    if moscow_now.tzinfo is None:
        moscow_now = moscow_now.replace(tzinfo=_moscow_tz())
    else:
        moscow_now = moscow_now.astimezone(_moscow_tz())
    current = moscow_now.time()
    return (
        time(9, 50) <= current <= time(10, 10)
        or time(11, 50) <= current <= time(12, 10)
    )


def _moscow_tz():
    """Return Europe/Moscow tzinfo, falling back to fixed UTC+03 on Windows."""

    try:
        return ZoneInfo("Europe/Moscow")
    except ZoneInfoNotFoundError:
        return MOSCOW_TZ


def sync_side_work_enabled(name: str, default: bool = True) -> bool:
    """Resolve a side-work flag, defaulting to disabled in peak fast mode."""
    explicit = os.environ.get(name)
    if explicit is None:
        explicit = os.environ.get(f"EOPP_{name}")
    if explicit is not None:
        return env_flag(name, default)
    if is_peak_fast_mode():
        return False
    return default


PEAK_FAST_MODE = is_peak_fast_mode()
CAPTCHA_SYNC_ARCHIVE_ENABLED = sync_side_work_enabled("CAPTCHA_SYNC_ARCHIVE_ENABLED")
CAPTCHA_SYNC_SOLVER_METADATA_ENABLED = sync_side_work_enabled(
    "CAPTCHA_SYNC_SOLVER_METADATA_ENABLED"
)
USAGE_SYNC_BILLING_ENABLED = sync_side_work_enabled("USAGE_SYNC_BILLING_ENABLED")
USAGE_SYNC_CAPTCHA_RECORDS_ENABLED = sync_side_work_enabled("USAGE_SYNC_CAPTCHA_RECORDS_ENABLED")
USAGE_SYNC_CONFIG_ENRICHMENT_ENABLED = sync_side_work_enabled(
    "USAGE_SYNC_CONFIG_ENRICHMENT_ENABLED"
)

# Единый путь к БД — все модули должны ссылаться сюда
DB_PATH = os.environ.get("EOPP_DB_PATH") or os.path.join(PROJECT_DIR, "data", "api_keys.db")

# Разрешённые origins для CORS (через запятую в env, по умолчанию localhost)
_CORS_ORIGINS_RAW = os.environ.get("EOPP_CORS_ORIGINS", "http://localhost:8765,http://localhost:8766,http://127.0.0.1:8765,http://127.0.0.1:8766")
CORS_ORIGINS = [o.strip() for o in _CORS_ORIGINS_RAW.split(",") if o.strip()]

DISTRIBUTION = {
    1: {"0": [0, 1, 2, 3, 4]},                                          # соло
    2: {"0": [0, 1, 2],        "1": [4, 3]},                            # 1 оп
    3: {"0": [0, 1],           "1": [4, 3],   "2": [2]},                # 2 оп
    4: {"0": [0, 1],           "1": [4],      "2": [3],   "3": [2]},    # 3 оп
    5: {"0": [0],              "1": [4],      "2": [3],   "3": [2],   "4": [1]},  # 4 оп
    6: {"0": [],               "1": [4],      "2": [3],   "3": [2],   "4": [1],   "5": [0]},  # 5 оп
}

# Full icon order per operator: own assigned first, then fallthrough.
# Master (op=0): exhausts each operator's queue from the end (busiest first).
# Operators (op>0): round-robin — one end-icon from each other operator, repeat.
ICON_ORDER = {
    2: {
        "0": [0, 1, 2, 3, 4],
        "1": [4, 3, 2, 1, 0],
    },
    3: {
        "0": [0, 1, 3, 4, 2],
        "1": [4, 3, 1, 2, 0],
        "2": [2, 1, 3, 0, 4],
    },
    4: {
        "0": [0, 1, 4, 3, 2],
        "1": [4, 1, 3, 2, 0],
        "2": [3, 1, 4, 2, 0],
        "3": [2, 1, 4, 3, 0],
    },
    5: {
        "0": [0, 4, 3, 2, 1],
        "1": [4, 3, 2, 1, 0],
        "2": [3, 2, 1, 0, 4],
        "3": [2, 1, 0, 4, 3],
        "4": [1, 0, 4, 3, 2],
    },
    6: {
        "0": [4, 3, 2, 1, 0],
        "1": [4, 3, 2, 1, 0],
        "2": [3, 2, 1, 0, 4],
        "3": [2, 1, 0, 4, 3],
        "4": [1, 0, 4, 3, 2],
        "5": [0, 4, 3, 2, 1],
    },
}

# Auto-solver: which icons to dispatch to rucaptcha per configuration.
# Sent from the END of the queue — skip first/eonly icons of operators.
AUTO_SOLVER_ORDER = {
    1: [4, 3, 2],    # solo master: queue from end, skip first (0)
    2: [3],          # master + 1 op: middle icon only
}

DISTRIBUTION_CROP_PAD = 60

use_ssl = True

_TEST_API_KEY = None


def _get_data_dir():
    return os.environ.get("EOPP_DATA_DIR") or os.path.join(PROJECT_DIR, "server", "data")


def _lazy(name, default_fn):
    val = os.environ.get(f"EOPP_{name}_DIR")
    return val if val else default_fn()


def __getattr__(name):
    if name == "DATA_DIR":
        return _get_data_dir()
    if name == "CAPTCHA_EXAMPLES_DIR":
        return _lazy("CAPTCHA_EXAMPLES", lambda: os.path.join(_get_data_dir(), "captcha_examples"))
    if name == "TEST_DIR":
        return __getattr__("CAPTCHA_EXAMPLES_DIR")
    if name == "VALID_DIR":
        return _lazy("VALID", lambda: os.path.join(_get_data_dir(), "captcha_examples", "valid"))
    if name == "NO_VALID_DIR":
        return _lazy(
            "NO_VALID", lambda: os.path.join(_get_data_dir(), "captcha_examples", "no_valid")
        )
    if name == "CAPTCHA_ALL_DIR":
        return _lazy("CAPTCHA_ALL", lambda: os.path.join(_get_data_dir(), "captcha_examples", "all"))
    if name == "PLUGINS_DIR":
        return os.environ.get("EOPP_PLUGINS_DIR") or os.path.join(PROJECT_DIR, "plugins")
    if name == "FRONTEND_DIST":
        return os.environ.get("EOPP_FRONTEND_DIST") or os.path.join(PROJECT_DIR, "frontend", "dist")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_test_api_key():
    global _TEST_API_KEY
    if _TEST_API_KEY is not None:
        return _TEST_API_KEY

    from src.repositories import api_key_repo

    existing = api_key_repo.get_key_by_label("__test_key__")
    if existing:
        _TEST_API_KEY = existing.key
        return _TEST_API_KEY

    row = api_key_repo.create_key("__test_key__", max_uses=None)
    _TEST_API_KEY = row.key
    return _TEST_API_KEY
