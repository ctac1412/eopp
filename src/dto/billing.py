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


@dataclass(slots=True)
class PrepaidDeductionDTO:
    id: int
    package_id: int
    usage_log_id: int
    amount: int
    created_at: str
    api_key_id: int | None = None
    key_label: str | None = None
    reservation_id: str | None = None
    company: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class CompanyAliasDTO:
    alias: str
    company: str
    created_at: str
    updated_at: str

    def to_dict(self) -> dict:
        return asdict(self)
