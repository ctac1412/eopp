from datetime import UTC, datetime

from src.entities import Tariff, get_session


def get_tariff(api_key_id: int) -> Tariff | None:
    with get_session() as session:
        return session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()


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


def delete_tariff(api_key_id: int) -> bool:
    with get_session() as session:
        tariff = session.query(Tariff).filter(Tariff.api_key_id == api_key_id).first()
        if not tariff:
            return False
        session.delete(tariff)
        session.commit()
        return True
