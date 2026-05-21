"""
EOPP Captcha Solver - Constants and Configuration.

Константы проекта:
- PORT - порт сервера (по умолчанию: 8765)
- TEST_DIR, VALID_DIR, NO_VALID_DIR - пути к тестовым данным
- CAPTCHA_TIMEOUT - таймаут ожидания решения капчи (10 сек)
- ADMIN_TOKEN - токен для админских операций
- PROTECTED_PATHS - пути требующие авторизации

Используется во всех модулях для доступа к конфигурации.
"""

import os

PORT = 8765
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTCHA_TIMEOUT = 10

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN") or 13243546
if not ADMIN_TOKEN:
    admin_token_path = os.path.join(PROJECT_DIR, "data", "admin_token")
    if os.path.exists(admin_token_path):
        with open(admin_token_path) as f:
            ADMIN_TOKEN = f.readline().strip()

ADMIN_TOKEN = str(ADMIN_TOKEN)
PROTECTED_PATHS = (
    "/api-keys",
    "/admin/streams",
    "/admin/test-stats",
    "/admin/benchmark",
)

write_mode = False
use_ssl = True
override_captcha_timeout = None

_TEST_API_KEY = None


def _get_data_dir():
    return os.environ.get("EOPP_DATA_DIR") or os.path.join(PROJECT_DIR, "data")


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
        return _lazy("NO_VALID", lambda: os.path.join(_get_data_dir(), "captcha_examples", "no_valid"))
    if name == "PLUGINS_DIR":
        return os.environ.get("EOPP_PLUGINS_DIR") or os.path.join(PROJECT_DIR, "plugins")
    if name == "FRONTEND_DIST":
        return os.environ.get("EOPP_FRONTEND_DIST") or os.path.join(PROJECT_DIR, "frontend", "dist")
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_test_api_key():
    global _TEST_API_KEY
    if _TEST_API_KEY is not None:
        return _TEST_API_KEY

    from src.db import create_key, get_key_by_label

    existing = get_key_by_label("__test_key__")
    if existing:
        _TEST_API_KEY = existing["key"]
        return _TEST_API_KEY

    row = create_key("__test_key__", max_uses=None)
    _TEST_API_KEY = row["key"]
    return _TEST_API_KEY
