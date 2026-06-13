"""
EOPP Captcha Solver - Database Layer.

Модули:
- connection: подключение к SQLite
- init: инициализация БД
- api_keys: CRUD для API ключей
- usage_log: логирование использования
- captchas: история отдельных капч
- tariffs: CRUD для тарифов
"""

from src.db.api_keys import (
    create_key,
    delete_key,
    get_key_by_id,
    get_key_by_label,
    get_key_record,
    increment_usage,
    is_super_kiosk_key,
    list_keys,
    reset_usage,
    update_key,
    validate_key,
)
from src.db.connection import DB_PATH, get_connection
from src.db.init import init_db
from src.db.tariffs import (
    create_tariff,
    delete_tariff,
    get_tariff,
    update_tariff,
)
from src.db.usage_log import (
    calc_debt,
    confirm_usage,
    delete_usage_log,
    fail_usage,
    get_usage_log_entry,
    list_usages,
    log_usage,
    update_usage_log,
)

__all__ = [
    "DB_PATH",
    "get_connection",
    "init_db",
    "create_key",
    "list_keys",
    "get_key_by_id",
    "update_key",
    "delete_key",
    "reset_usage",
    "validate_key",
    "increment_usage",
    "get_key_record",
    "get_key_by_label",
    "is_super_kiosk_key",
    "get_usage_log_entry",
    "delete_usage_log",
    "log_usage",
    "confirm_usage",
    "fail_usage",
    "list_usages",
    "calc_debt",
    "update_usage_log",
    "get_tariff",
    "create_tariff",
    "update_tariff",
    "delete_tariff",
]
