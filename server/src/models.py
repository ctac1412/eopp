"""
EOPP Captcha Solver - Pydantic Models.

Pydantic-модели для валидации запросов API:
- SolveRequest, SolveCaptchaBody - работа с капчей
- CreateApiKeyBody, UpdateApiKeyBody - управление API ключами
- ConfirmUsageBody, FailUsageBody - логирование использования
- MockConfigBody - настройка мок-ответов

Используются в routes.py для валидации входящих данных.
"""

from typing import Any

from pydantic import BaseModel


class SolveRequest(BaseModel):
    captcha_id: str
    variantIndex: int = 0
    api_key: str | None = None
    usage_log_id: int | None = None
    coordinates: list[dict] | None = None  # [{x: int, y: int}, ...] for icon-click


class SolveCaptchaBody(BaseModel):
    api_key: str
    auto_solve: bool = False
    auto_solve_rucaptcha: bool = False
    timeout_metadata: bool = False
    captcha_id: str | None = None
    reservation_id: str | None = None
    usage_log_id: int | None = None
    type: int | None = None
    token: str | None = None
    silhouette: str | None = None
    puzzle: dict[str, Any] | None = None
    valid_index: int | None = None
    test_no_timeout: bool = False


class CreateApiKeyBody(BaseModel):
    label: str = ""
    max_uses: int | None = None
    is_external: bool = False
    company_id: int | None = None
    user_id: int | None = None


class UpdateApiKeyBody(BaseModel):
    label: str | None = None
    max_uses: int | None = None
    active: bool | None = None
    comment: str | None = None
    is_admin: bool | None = None
    is_super_kiosk: bool | None = None
    is_external: bool | None = None
    company_id: int | None = None
    user_id: int | None = None


class UpdateUsageLogBody(BaseModel):
    price: int | None = None
    paid: bool | None = None


class ConfirmUsageBody(BaseModel):
    usage_log_id: int
    api_key: str
    slot_date: str | None = None
    logs: list[str] | None = None


class FailUsageBody(BaseModel):
    usage_log_id: int
    api_key: str
    error_message: str = ""
    error_stage: str = "other"
    slot_date: str | None = None
    logs: list[str] | None = None


class GenerateCaptchaBody(BaseModel):
    facilityId: str | None = None
    timeSlotData: str | None = None
    reservationId: str | None = None
    encryptedTso: str | None = None
    payload: dict[str, Any] | None = None


class AdminAuthBody(BaseModel):
    login: str = ""
    password: str = ""


class ValidateKeyQuery(BaseModel):
    key: str


class ApiKeyStatusQuery(BaseModel):
    key: str


class UsageLogQuery(BaseModel):
    api_key_id: int | None = None


class RegisterUsageBody(BaseModel):
    api_key: str
    reservation_id: str
    captcha_id: str | None = None
    config_json: dict[str, Any] | None = None


class MockConfigBody(BaseModel):
    endpoints: dict[str, dict[str, Any]] = {}
    captcha_type: str | None = None


class TariffBody(BaseModel):
    price_create: int
    price_reschedule: int
    price_create_peak: int | None = None
    price_custom_slots: int | None = None
    executor_amount: int | None = None
    operator_amount: int | None = None


class CreateInvoiceBody(BaseModel):
    invoice_number: str | None = None
    comment: str = ""
    percent_rate: float = 0
    tax_rate: float = 0
    debt_amount: int = 0
    percent_amount: int = 0
    tax_amount: int = 0
    total_amount: int = 0
    items: list[dict] = []
    commission_user_id: int | None = None
    tax_user_id: int | None = None


class GenerateInvoiceBody(BaseModel):
    usage_log_ids: list[int]
    comment: str = ""
    percent_rate: float = 0
    tax_rate: float = 0
    debt_amount: int = 0
    percent_amount: int = 0
    tax_amount: int = 0
    total_amount: int = 0


class UpdateInvoiceBody(BaseModel):
    paid: bool | None = None
    comment: str | None = None
    percent_rate: float | None = None
    tax_rate: float | None = None
    debt_amount: int | None = None
    percent_amount: int | None = None
    tax_amount: int | None = None
    total_amount: int | None = None
    items: list[dict] | None = None
    commission_user_id: int | None = None
    tax_user_id: int | None = None


class CreateUserBody(BaseModel):
    name: str
    login: str | None = None
    password: str | None = None
    role: str = "manager"
    system_role: str | None = None
    active: bool = True
    is_director: bool = False
    company_id: int | None = None
    company_memberships: list[dict] | None = None
    operator_profile: dict | None = None
    finance_profile: dict | None = None
    finance_access: dict | None = None
    operator_access: dict | None = None
    executor_access: dict | None = None


class UpdateUserBody(BaseModel):
    name: str | None = None
    login: str | None = None
    password: str | None = None
    role: str | None = None
    system_role: str | None = None
    active: bool | None = None
    is_director: bool | None = None
    company_id: int | None = None
    company_memberships: list[dict] | None = None
    operator_profile: dict | None = None
    finance_profile: dict | None = None
    finance_access: dict | None = None
    operator_access: dict | None = None
    executor_access: dict | None = None


class AccessAssignmentBody(BaseModel):
    company_ids: list[int] = []
    all_companies: bool = False


class UserCompanyAccessBody(BaseModel):
    finance: AccessAssignmentBody | None = None
    operator: AccessAssignmentBody | None = None
    executor: AccessAssignmentBody | None = None


class CompanyAccessBody(BaseModel):
    finance_user_ids: list[int] | None = None
    operator_user_ids: list[int] | None = None
    executor_user_ids: list[int] | None = None


class CreateExpenseBody(BaseModel):
    amount: int
    reason: str
    user_id: int | None = None
    comment: str = ""


class UpdateExpenseBody(BaseModel):
    amount: int | None = None
    reason: str | None = None
    comment: str | None = None
    user_id: int | None = None
    created_at: str | None = None


class FinanceEntryBody(BaseModel):
    company_id: int | None = None
    usage_log_id: int | None = None
    invoice_id: int | None = None
    payout_id: int | None = None
    expense_id: int | None = None
    profit_lot_id: int | None = None
    distribution_answer_id: int | None = None
    user_id: int | None = None
    kind: str = "manual_adjustment"
    amount: int
    comment: str = ""


class UpdateFinanceEntryBody(BaseModel):
    company_id: int | None = None
    usage_log_id: int | None = None
    invoice_id: int | None = None
    expense_id: int | None = None
    profit_lot_id: int | None = None
    distribution_answer_id: int | None = None
    user_id: int | None = None
    kind: str | None = None
    amount: int | None = None
    comment: str | None = None


class CreatePayoutBody(BaseModel):
    name: str
    invoice_ids: list[int] = []
    expense_ids: list[int] = []
    expense_repayments: list[dict] = []
    user_splits: list[dict] = []
    # user_splits = [{"user_id": int, "split_pct": float}, ...]


class PreviewPayoutBody(BaseModel):
    invoice_ids: list[int] = []
    expense_ids: list[int] = []
    expense_repayments: list[dict] = []
    user_splits: list[dict] = []


class UpdatePayoutBody(BaseModel):
    name: str | None = None


class SetPayoutStatusBody(BaseModel):
    status: str  # "completed" | "cancelled"


class OpenInvoiceBody(BaseModel):
    company: str = ""
    comment: str = ""


class CompanyBillingSettingBody(BaseModel):
    auto_invoice_reopen: bool = False


class CompanyAliasBody(BaseModel):
    alias: str = ""
    company: str = ""


class CompanyBody(BaseModel):
    name: str
    aliases: list[str] | None = None
    notes: str | None = None


class UpdateCompanyBody(BaseModel):
    name: str | None = None
    aliases: list[str] | None = None
    notes: str | None = None


class CreatePrepaidPackageBody(BaseModel):
    api_key_id: int
    balance_amount: int
    active: bool = True


class UpdatePrepaidPackageBody(BaseModel):
    balance_amount: int | None = None
    active: bool | None = None


class TopUpPrepaidPackageBody(BaseModel):
    amount: int


class TelegramPreviewBody(BaseModel):
    command: str = ""


class CaptchaLabelSaveBody(BaseModel):
    captcha_id: str
    variant_index: int


class SendSelectedCaptchasBody(BaseModel):
    captcha_ids: list[str] = []


class OperatorSubscribeBody(BaseModel):
    operator_key: str
    master_key: str


class OperatorUnsubscribeBody(BaseModel):
    operator_key: str
    master_key: str


class DistributionAnswerBody(BaseModel):
    captcha_id: str
    operator_id: int
    icon_position: int
    x: int
    y: int


class ChatMessageBody(BaseModel):
    sender_role: str  # "master" | "operator"
    sender_id: int
    sender_label: str
    message: str
    master_key_id: int


class AdminChatBroadcastBody(BaseModel):
    message: str
    sender_label: str = "Администратор"


class ScheduledEventBody(BaseModel):
    api_key_id: int = 0
    api_key: str | None = None
    label: str
    scheduled_at: str  # ISO format
    description: str = ""


class UpdateOperatorBody(BaseModel):
    nickname: str | None = None
    icon_display_mode: str | None = None
    icon_rate: int | None = None
    allowed_master_keys: list[int] | None = None
    company_id: int | None = None


class AdminRelinkBody(BaseModel):
    master_key_id: int
