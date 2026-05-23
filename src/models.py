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
    variantIndex: int
    api_key: str | None = None
    usage_log_id: int | None = None


class SolveCaptchaBody(BaseModel):
    api_key: str
    auto_solve: bool = False
    captcha_id: str | None = None
    reservation_id: str | None = None
    usage_log_id: int | None = None
    type: int | None = None
    token: str | None = None
    silhouette: str | None = None
    puzzle: dict[str, Any] | None = None
    valid_index: int | None = None


class CreateApiKeyBody(BaseModel):
    label: str = ""
    max_uses: int | None = None


class UpdateApiKeyBody(BaseModel):
    label: str | None = None
    max_uses: int | None = None
    active: bool | None = None
    comment: str | None = None
    is_admin: bool | None = None
    is_super_kiosk: bool | None = None


class UpdateUsageLogBody(BaseModel):
    price: int | None = None
    paid: bool | None = None


class ConfirmUsageBody(BaseModel):
    usage_log_id: int
    api_key: str
    slot_date: str | None = None
    logs: list[str] | None = None
    captcha_id: str | None = None
    valid_variant_index: int | None = None


class FailUsageBody(BaseModel):
    usage_log_id: int
    api_key: str
    error_message: str = ""
    error_stage: str = "other"
    slot_date: str | None = None
    logs: list[str] | None = None
    captcha_id: str | None = None
    valid_variant_index: int | None = None


class GenerateCaptchaBody(BaseModel):
    facilityId: str | None = None
    timeSlotData: str | None = None
    reservationId: str | None = None
    encryptedTso: str | None = None
    payload: dict[str, Any] | None = None


class AdminAuthBody(BaseModel):
    token: str = ""


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


class TariffBody(BaseModel):
    price_create: int
    price_reschedule: int
    price_create_peak: int | None = None


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


class UpdateUserBody(BaseModel):
    name: str


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


class CreatePayoutBody(BaseModel):
    name: str
    invoice_ids: list[int] = []
    expense_ids: list[int] = []
    user_splits: list[dict] = []
    # user_splits = [{"user_id": int, "split_pct": float}, ...]


class PreviewPayoutBody(BaseModel):
    invoice_ids: list[int] = []
    expense_ids: list[int] = []
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


class CreatePrepaidPackageBody(BaseModel):
    api_key_id: int
    balance_amount: int
    active: bool = True


class UpdatePrepaidPackageBody(BaseModel):
    balance_amount: int | None = None
    active: bool | None = None


class TopUpPrepaidPackageBody(BaseModel):
    amount: int
