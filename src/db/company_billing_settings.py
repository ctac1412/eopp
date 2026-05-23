"""Per-company billing settings."""

from datetime import UTC, datetime

from src.db.connection import get_connection


def _row_to_dict(row) -> dict:
    return {
        "company": row["company"],
        "auto_invoice_reopen": bool(row["auto_invoice_reopen"]),
        "updated_at": row["updated_at"],
    }


def get_company_billing_settings(company: str) -> dict:
    conn = get_connection()
    row = conn.execute(
        "SELECT company, auto_invoice_reopen, updated_at FROM company_billing_settings WHERE company = ?",
        (company,),
    ).fetchone()
    conn.close()
    if not row:
        return {
            "company": company,
            "auto_invoice_reopen": False,
            "updated_at": None,
        }
    return _row_to_dict(row)


def list_company_billing_settings() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT company, auto_invoice_reopen, updated_at FROM company_billing_settings ORDER BY company ASC"
    ).fetchall()
    conn.close()
    return [_row_to_dict(row) for row in rows]


def upsert_company_billing_settings(company: str, auto_invoice_reopen: bool) -> dict:
    conn = get_connection()
    now = datetime.now(UTC).isoformat()
    conn.execute(
        """
        INSERT INTO company_billing_settings (company, auto_invoice_reopen, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(company) DO UPDATE SET
            auto_invoice_reopen = excluded.auto_invoice_reopen,
            updated_at = excluded.updated_at
        """,
        (company, 1 if auto_invoice_reopen else 0, now),
    )
    conn.commit()
    row = conn.execute(
        "SELECT company, auto_invoice_reopen, updated_at FROM company_billing_settings WHERE company = ?",
        (company,),
    ).fetchone()
    conn.close()
    return _row_to_dict(row)
