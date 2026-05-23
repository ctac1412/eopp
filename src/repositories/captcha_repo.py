from src.entities import CaptchaRecord, get_session


def list_records(usage_log_id: int | None = None) -> list[CaptchaRecord]:
    with get_session() as session:
        q = session.query(CaptchaRecord)
        if usage_log_id is not None:
            q = q.filter(CaptchaRecord.usage_log_id == usage_log_id)
        return q.order_by(CaptchaRecord.created_at).all()


def get_record(captcha_record_id: int) -> CaptchaRecord | None:
    with get_session() as session:
        return session.get(CaptchaRecord, captcha_record_id)


def delete_record(captcha_record_id: int) -> bool:
    with get_session() as session:
        record = session.get(CaptchaRecord, captcha_record_id)
        if not record:
            return False
        session.delete(record)
        session.commit()
        return True
