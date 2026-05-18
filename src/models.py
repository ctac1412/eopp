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


class BroadcastBody(BaseModel):
    pass


class CreateApiKeyBody(BaseModel):
    label: str = ""
    max_uses: int | None = None


class UpdateApiKeyBody(BaseModel):
    label: str | None = None
    max_uses: int | None = None
    active: bool | None = None
    comment: str | None = None


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
    facilityId: str
    timeSlotData: str
    reservationId: str | None = None
    encryptedTso: str | None = None


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
    paid: bool


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


class CreatePayoutBody(BaseModel):
    name: str
    invoice_ids: list[int] = []
    expense_ids: list[int] = []
    user_splits: list[dict] = []
    # user_splits = [{"user_id": int, "split_pct": float}, ...]


class UpdatePayoutBody(BaseModel):
    name: str | None = None


class SetPayoutStatusBody(BaseModel):
    status: str  # "completed" | "cancelled"
