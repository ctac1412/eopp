from dataclasses import asdict, dataclass


@dataclass(slots=True)
class CompanyBillingSettingsDTO:
    company: str
    auto_invoice_reopen: bool
    updated_at: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class PrepaidPackageDTO:
    id: int
    api_key_id: int
    balance_amount: int
    active: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> dict:
        return asdict(self)
