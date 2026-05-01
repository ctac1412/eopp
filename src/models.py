from typing import Any, Optional

from pydantic import BaseModel, Field


class SolveRequest(BaseModel):
    captcha_id: str
    variantIndex: int


class SolveCaptchaBody(BaseModel):
    api_key: str
    auto_solve: bool = False
    captcha_id: Optional[str] = None
    reservation_id: Optional[str] = None
    type: Optional[int] = None
    token: Optional[str] = None
    silhouette: Optional[str] = None
    puzzle: Optional[dict[str, Any]] = None
    valid_index: Optional[int] = None


class BroadcastBody(BaseModel):
    pass


class CreateApiKeyBody(BaseModel):
    label: str = ""
    max_uses: Optional[int] = None


class UpdateApiKeyBody(BaseModel):
    label: Optional[str] = None
    max_uses: Optional[int] = None
    active: Optional[bool] = None


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
    facilityId: str
    timeSlotData: str
    reservationId: Optional[str] = None
    encryptedTso: Optional[str] = None


class AdminAuthBody(BaseModel):
    token: str = ""


class ValidateKeyQuery(BaseModel):
    key: str


class ApiKeyStatusQuery(BaseModel):
    key: str


class UsageLogQuery(BaseModel):
    api_key_id: Optional[int] = None
