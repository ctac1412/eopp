from src.entities import CaptchaFile, get_session
from src.db.connection import get_connection


def list_files(limit: int | None = None, offset: int = 0) -> list[CaptchaFile]:
    with get_session() as session:
        query = (
            session.query(CaptchaFile)
            .order_by(CaptchaFile.action_date.desc().nullslast(), CaptchaFile.id.desc())
        )
        if limit is not None:
            query = query.limit(limit).offset(offset)
        return query.all()


def get_by_captcha_id(captcha_id: str) -> CaptchaFile | None:
    with get_session() as session:
        return session.query(CaptchaFile).filter(CaptchaFile.captcha_id == captcha_id).first()


def upsert_file(meta: dict) -> int:
    with get_session() as session:
        record = session.query(CaptchaFile).filter(CaptchaFile.captcha_id == meta["captcha_id"]).first()
        if record is None:
            record = CaptchaFile(**meta)
            session.add(record)
        else:
            for key, value in meta.items():
                if key in ("created_at", "file_mtime"):
                    continue
                setattr(record, key, value)
        session.commit()
        return record.id


def list_usage_log_links() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT
            c.captcha_id AS captcha_id,
            c.usage_log_id AS usage_log_id,
            ul.created_at AS usage_log_created_at,
            ul.logs AS logs
        FROM captchas c
        JOIN usage_log ul ON ul.id = c.usage_log_id
        WHERE ul.logs IS NOT NULL
        ORDER BY c.id ASC
        """
    ).fetchall()
    conn.close()
    return [
        {
            "captcha_id": row["captcha_id"],
            "usage_log_id": row["usage_log_id"],
            "usage_log_created_at": row["usage_log_created_at"],
            "logs": row["logs"],
        }
        for row in rows
    ]


def list_all_captcha_ids() -> list[str]:
    conn = get_connection()
    rows = conn.execute("SELECT captcha_id FROM captcha_files ORDER BY id ASC").fetchall()
    conn.close()
    return [r[0] for r in rows]


def update_classification(captcha_id: str, classification: str | None) -> bool:
    conn = get_connection()
    cur = conn.execute(
        "UPDATE captcha_files SET classification = ? WHERE captcha_id = ?",
        (classification, captcha_id),
    )
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def get_usage_log_date(captcha_id: str) -> str | None:
    """Return usage_log.created_at for the given captcha_id, if any."""
    conn = get_connection()
    row = conn.execute(
        """
        SELECT ul.created_at
        FROM captchas c
        JOIN usage_log ul ON ul.id = c.usage_log_id
        WHERE c.captcha_id = ?
        ORDER BY ul.created_at DESC
        LIMIT 1
        """,
        (captcha_id,),
    ).fetchone()
    conn.close()
    return row["created_at"] if row else None


def get_usage_log_id_for_captcha(captcha_id: str) -> int | None:
    """Return usage_log_id for the given captcha_id from captchas table."""
    conn = get_connection()
    row = conn.execute(
        "SELECT usage_log_id FROM captchas WHERE captcha_id = ? ORDER BY id DESC LIMIT 1",
        (captcha_id,),
    ).fetchone()
    conn.close()
    return row["usage_log_id"] if row else None


def update_action_date(captcha_id: str, action_date: str) -> bool:
    conn = get_connection()
    cur = conn.execute(
        "UPDATE captcha_files SET action_date = ? WHERE captcha_id = ?",
        (action_date, captcha_id),
    )
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def get_captcha_files_without_action_date() -> list[str]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT captcha_id FROM captcha_files WHERE action_date IS NULL ORDER BY id ASC"
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]
