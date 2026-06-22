from datetime import UTC, datetime

from src.entities import CompanyTariff, DefaultCompanyTariff, get_session
from src.repositories import company_billing_repo

_UNSET = object()


def _normalize_rate(rate: float | int | None | object) -> float:
    if rate is _UNSET or rate is None:
        return 0
    return max(float(rate), 0)


def _normalize_user_id(user_id: int | None | object) -> int | None:
    if user_id is _UNSET or not user_id:
        return None
    return int(user_id)


def tariff_to_dict(
    tariff: CompanyTariff | DefaultCompanyTariff,
    *,
    source: str,
    company_id: int | None = None,
) -> dict:
    data = {
        "price_create": tariff.price_create,
        "price_reschedule": tariff.price_reschedule,
        "price_create_peak": tariff.price_create_peak,
        "price_custom_slots": tariff.price_custom_slots,
        "executor_amount": getattr(tariff, "executor_amount", 0),
        "operator_amount": getattr(tariff, "operator_amount", 0),
        "operator_puzzle_amount": getattr(tariff, "operator_puzzle_amount", 0),
        "source": source,
    }
    if company_id is not None:
        data["company_id"] = company_id
    if isinstance(tariff, DefaultCompanyTariff):
        data.update(
            {
                "tax_commission_mode": company_billing_repo.normalize_tax_commission_mode(
                    getattr(tariff, "tax_commission_mode", None)
                ),
                "default_percent_rate": getattr(tariff, "default_percent_rate", 0) or 0,
                "default_tax_rate": getattr(tariff, "default_tax_rate", 0) or 0,
                "default_commission_user_id": getattr(
                    tariff, "default_commission_user_id", None
                ),
                "default_tax_user_id": getattr(tariff, "default_tax_user_id", None),
            }
        )
    return data


def get_company_tariff(company_id: int) -> CompanyTariff | None:
    with get_session() as session:
        return session.query(CompanyTariff).filter(CompanyTariff.company_id == company_id).first()


def get_default_company_tariff() -> DefaultCompanyTariff | None:
    with get_session() as session:
        return session.query(DefaultCompanyTariff).order_by(DefaultCompanyTariff.id).first()


def get_effective_tariff(_api_key_id: int, company_id: int | None) -> tuple[CompanyTariff | None, str | None]:
    with get_session() as session:
        if company_id is None:
            return None, None
        company_tariff = (
            session.query(CompanyTariff)
            .filter(CompanyTariff.company_id == company_id)
            .first()
        )
        if company_tariff:
            return company_tariff, "company"
        return None, None


def upsert_company_tariff(
    company_id: int,
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
    price_custom_slots: int | None = None,
    executor_amount: int = 0,
    operator_amount: int = 0,
    operator_puzzle_amount: int = 0,
) -> CompanyTariff:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        tariff = session.query(CompanyTariff).filter(CompanyTariff.company_id == company_id).first()
        if tariff:
            tariff.price_create = price_create
            tariff.price_reschedule = price_reschedule
            tariff.price_create_peak = price_create_peak
            tariff.price_custom_slots = price_custom_slots
            tariff.executor_amount = executor_amount
            tariff.operator_amount = operator_amount
            tariff.operator_puzzle_amount = operator_puzzle_amount
            tariff.updated_at = now
        else:
            tariff = CompanyTariff(
                company_id=company_id,
                price_create=price_create,
                price_reschedule=price_reschedule,
                price_create_peak=price_create_peak,
                price_custom_slots=price_custom_slots,
                executor_amount=executor_amount,
                operator_amount=operator_amount,
                operator_puzzle_amount=operator_puzzle_amount,
                created_at=now,
                updated_at=now,
            )
            session.add(tariff)
        session.commit()
        session.refresh(tariff)
        return tariff


def upsert_default_company_tariff(
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
    price_custom_slots: int | None = None,
    executor_amount: int = 0,
    operator_amount: int = 0,
    operator_puzzle_amount: int = 0,
    tax_commission_mode: str | None | object = _UNSET,
    default_percent_rate: float | None | object = _UNSET,
    default_tax_rate: float | None | object = _UNSET,
    default_commission_user_id: int | None | object = _UNSET,
    default_tax_user_id: int | None | object = _UNSET,
) -> DefaultCompanyTariff:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        tariff = session.query(DefaultCompanyTariff).order_by(DefaultCompanyTariff.id).first()
        if tariff:
            tariff.price_create = price_create
            tariff.price_reschedule = price_reschedule
            tariff.price_create_peak = price_create_peak
            tariff.price_custom_slots = price_custom_slots
            tariff.executor_amount = executor_amount
            tariff.operator_amount = operator_amount
            tariff.operator_puzzle_amount = operator_puzzle_amount
            if tax_commission_mode is not _UNSET:
                tariff.tax_commission_mode = company_billing_repo.normalize_tax_commission_mode(
                    tax_commission_mode
                )
            if default_percent_rate is not _UNSET:
                tariff.default_percent_rate = _normalize_rate(default_percent_rate)
            if default_tax_rate is not _UNSET:
                tariff.default_tax_rate = _normalize_rate(default_tax_rate)
            if default_commission_user_id is not _UNSET:
                tariff.default_commission_user_id = _normalize_user_id(default_commission_user_id)
            if default_tax_user_id is not _UNSET:
                tariff.default_tax_user_id = _normalize_user_id(default_tax_user_id)
            tariff.updated_at = now
        else:
            tariff = DefaultCompanyTariff(
                price_create=price_create,
                price_reschedule=price_reschedule,
                price_create_peak=price_create_peak,
                price_custom_slots=price_custom_slots,
                executor_amount=executor_amount,
                operator_amount=operator_amount,
                operator_puzzle_amount=operator_puzzle_amount,
                tax_commission_mode=company_billing_repo.normalize_tax_commission_mode(
                    None if tax_commission_mode is _UNSET else tax_commission_mode
                ),
                default_percent_rate=_normalize_rate(default_percent_rate),
                default_tax_rate=_normalize_rate(default_tax_rate),
                default_commission_user_id=_normalize_user_id(default_commission_user_id),
                default_tax_user_id=_normalize_user_id(default_tax_user_id),
                created_at=now,
                updated_at=now,
            )
            session.add(tariff)
        session.commit()
        session.refresh(tariff)
        return tariff


def apply_default_company_tariff(company_id: int) -> CompanyTariff | None:
    default_tariff = get_default_company_tariff()
    if not default_tariff:
        return None
    return upsert_company_tariff(
        company_id,
        default_tariff.price_create,
        default_tariff.price_reschedule,
        default_tariff.price_create_peak,
        default_tariff.price_custom_slots,
        default_tariff.executor_amount,
        default_tariff.operator_amount,
        getattr(default_tariff, "operator_puzzle_amount", 0),
    )


def apply_default_company_billing_settings(company: str):
    default_tariff = get_default_company_tariff()
    if not default_tariff:
        return None
    current = company_billing_repo.get_company_billing_settings(company)
    return company_billing_repo.upsert_company_billing_settings(
        company,
        bool(getattr(current, "auto_invoice_reopen", False)),
        getattr(default_tariff, "tax_commission_mode", "added"),
        default_percent_rate=getattr(default_tariff, "default_percent_rate", 0) or 0,
        default_tax_rate=getattr(default_tariff, "default_tax_rate", 0) or 0,
        default_commission_user_id=getattr(default_tariff, "default_commission_user_id", None),
        default_tax_user_id=getattr(default_tariff, "default_tax_user_id", None),
    )


def delete_company_tariff(company_id: int) -> bool:
    with get_session() as session:
        tariff = session.query(CompanyTariff).filter(CompanyTariff.company_id == company_id).first()
        if not tariff:
            return False
        session.delete(tariff)
        session.commit()
        return True
