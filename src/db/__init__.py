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
    check_admin_token,
    is_super_kiosk_key,
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
from src.db.captchas import (
    list_captchas,
    get_captcha_by_id,
    delete_captcha,
    create_captcha_records,
)
from src.db.tariffs import (
    get_tariff,
    create_tariff,
    update_tariff,
    delete_tariff,
)
from src.db.expenses import (
    list_expenses,
    get_expense_by_id,
    create_expense,
    update_expense,
    delete_expense,
    get_total_expenses,
    get_total_expenses_by_user,
)
from src.db.payouts import (
    list_payouts,
    get_payout_by_id,
    create_payout,
    update_payout,
    set_payout_status,
    delete_payout,
    calculate_payout,
    recalculate_payout,
)
from src.db.users import (
    list_users,
    get_user_by_id,
    create_user,
    update_user,
    delete_user,
)
from src.db.prepaid import (
    create_prepaid_package,
    deduct_prepaid_for_usage,
    delete_prepaid_package,
    get_active_prepaid_package,
    list_prepaid_packages,
    update_prepaid_package,
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
    "check_admin_token",
    "is_super_kiosk_key",
    "get_usage_log_entry",
    "delete_usage_log",
    "log_usage",
    "confirm_usage",
    "fail_usage",
    "list_usages",
    "calc_debt",
    "update_usage_log",
    "list_captchas",
    "get_captcha_by_id",
    "delete_captcha",
    "create_captcha_records",
    "get_tariff",
    "create_tariff",
    "update_tariff",
    "delete_tariff",
    "list_expenses",
    "get_expense_by_id",
    "create_expense",
    "update_expense",
    "delete_expense",
    "get_total_expenses",
    "get_total_expenses_by_user",
    "list_payouts",
    "get_payout_by_id",
    "create_payout",
    "update_payout",
    "set_payout_status",
    "delete_payout",
    "calculate_payout",
    "recalculate_payout",
    "list_users",
    "get_user_by_id",
    "create_user",
    "update_user",
    "delete_user",
    "list_prepaid_packages",
    "create_prepaid_package",
    "update_prepaid_package",
    "delete_prepaid_package",
    "get_active_prepaid_package",
    "deduct_prepaid_for_usage",
]
