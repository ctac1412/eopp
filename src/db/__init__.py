"""
EOPP Captcha Solver - Database Layer.

Модули:
- connection: подключение к SQLite
- init: инициализация БД
- api_keys: CRUD для API ключей
- usage_log: логирование использования
- tariffs: CRUD для тарифов
- withdrawals: CRUD для способов вывода
"""

from src.db.connection import get_connection, DB_PATH
from src.db.init import init_db
from src.db.api_keys import (
    create_key,
    list_keys,
    get_key_by_id,
    update_key,
    delete_key,
    reset_usage,
    validate_key,
    increment_usage,
    get_key_record,
    get_key_by_label,
)
from src.db.usage_log import (
    get_usage_log_entry,
    delete_usage_log,
    log_usage,
    confirm_usage,
    fail_usage,
    list_usages,
    calc_debt,
    update_usage_log,
)
from src.db.tariffs import (
    get_tariff,
    create_tariff,
    update_tariff,
    delete_tariff,
)
from src.db.withdrawals import (
    list_withdrawals,
    get_withdrawal,
    create_withdrawal,
    update_withdrawal,
    delete_withdrawal,
)

__all__ = [
    "get_connection",
    "DB_PATH",
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
    "list_withdrawals",
    "get_withdrawal",
    "create_withdrawal",
    "update_withdrawal",
    "delete_withdrawal",
]
