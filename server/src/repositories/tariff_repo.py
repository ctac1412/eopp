from datetime import UTC, datetime

from src.entities import CompanyTariff, DefaultCompanyTariff, Tariff, get_session


def tariff_to_dict(
    tariff: Tariff | CompanyTariff | DefaultCompanyTariff,
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
        "source": source,
    }
    if company_id is not None:
        data["company_id"] = company_id
    return data


def get_tariff(api_key_id: int) -> Tariff | None:
    with get_session() as session:
        return session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()


def get_company_tariff(company_id: int) -> CompanyTariff | None:
    with get_session() as session:
        return session.query(CompanyTariff).filter(CompanyTariff.company_id == company_id).first()


def get_default_company_tariff() -> DefaultCompanyTariff | None:
    with get_session() as session:
        return session.query(DefaultCompanyTariff).order_by(DefaultCompanyTariff.id).first()


def get_effective_tariff(api_key_id: int, company_id: int | None) -> tuple[Tariff | CompanyTariff | None, str | None]:
    with get_session() as session:
        tariff = session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()
        if tariff:
            return tariff, "api_key"
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


def upsert_tariff(
    api_key_id: int,
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
    price_custom_slots: int | None = None,
) -> Tariff:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        tariff = session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()
        if tariff:
            tariff.price_create = price_create
            tariff.price_reschedule = price_reschedule
            tariff.price_create_peak = price_create_peak
            tariff.price_custom_slots = price_custom_slots
            tariff.updated_at = now
        else:
            tariff = Tariff(
                api_key_id=api_key_id,
                price_create=price_create,
                price_reschedule=price_reschedule,
                price_create_peak=price_create_peak,
                price_custom_slots=price_custom_slots,
                created_at=now,
                updated_at=now,
            )
            session.add(tariff)
        session.commit()
        session.refresh(tariff)
        return tariff


def upsert_company_tariff(
    company_id: int,
    price_create: int,
    price_reschedule: int,
    price_create_peak: int | None = None,
    price_custom_slots: int | None = None,
    executor_amount: int = 0,
    operator_amount: int = 0,
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
            tariff.updated_at = now
        else:
            tariff = DefaultCompanyTariff(
                price_create=price_create,
                price_reschedule=price_reschedule,
                price_create_peak=price_create_peak,
                price_custom_slots=price_custom_slots,
                executor_amount=executor_amount,
                operator_amount=operator_amount,
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
    )


def delete_tariff(api_key_id: int) -> bool:
    with get_session() as session:
        tariff = session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()
        if not tariff:
            return False
        session.delete(tariff)
        session.commit()
        return True


def delete_company_tariff(company_id: int) -> bool:
    with get_session() as session:
        tariff = session.query(CompanyTariff).filter(CompanyTariff.company_id == company_id).first()
        if not tariff:
            return False
        session.delete(tariff)
        session.commit()
        return True
