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


class SlotDict(BaseModel):
    id: str
    time: str
    count: int
    slotCaption: str
    intervalIndex: int


class SlotsGroupBody(BaseModel):
    group_id: str
    consumer_id: int
    api_key: str
    slots: list[SlotDict] = []


class UploadPluginBody(BaseModel):
    version: str
    manifest: dict[str, Any]
    zip_file: str
    note: str | None = None
    overwrite: bool | None = False
