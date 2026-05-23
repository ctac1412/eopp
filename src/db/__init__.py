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
    check_admin_token,
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
from src.db.captchas import (
    create_captcha_records,
    delete_captcha,
    get_captcha_by_id,
    list_captchas,
)
from src.db.company_billing_settings import (
    get_company_billing_settings,
    list_company_billing_settings,
    upsert_company_billing_settings,
)
from src.db.connection import DB_PATH, get_connection
from src.db.expenses import (
    create_expense,
    delete_expense,
    get_expense_by_id,
    get_total_expenses,
    get_total_expenses_by_user,
    list_expenses,
    update_expense,
)
from src.db.init import init_db
from src.db.payouts import (
    calculate_payout,
    create_payout,
    delete_payout,
    get_payout_by_id,
    list_payouts,
    recalculate_payout,
    set_payout_status,
    update_payout,
)
from src.db.prepaid import (
    create_prepaid_package,
    deduct_prepaid_for_usage,
    delete_prepaid_package,
    get_active_prepaid_package,
    list_prepaid_packages,
    update_prepaid_package,
)
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
from src.db.users import (
    create_user,
    delete_user,
    get_user_by_id,
    list_users,
    update_user,
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
    "get_company_billing_settings",
    "list_company_billing_settings",
    "upsert_company_billing_settings",
]
