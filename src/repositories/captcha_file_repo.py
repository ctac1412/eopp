from src.entities import CaptchaFile, get_session
from src.db.connection import get_connection


def list_files() -> list[CaptchaFile]:
    with get_session() as session:
        return (
            session.query(CaptchaFile)
            .order_by(CaptchaFile.file_mtime.desc(), CaptchaFile.id.desc())
            .all()
        )


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
                if key == "created_at":
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
