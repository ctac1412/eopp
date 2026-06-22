"""
EOPP Captcha Solver - Tariffs.

CRUD операции для тарифов.
"""

from src.db.connection import get_connection


def _company_tariff_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "company_id": row["company_id"],
        "price_create": row["price_create"],
        "price_reschedule": row["price_reschedule"],
        "price_create_peak": row["price_create_peak"],
        "price_custom_slots": row["price_custom_slots"],
        "executor_amount": row["executor_amount"],
        "operator_amount": row["operator_amount"],
        "operator_puzzle_amount": row["operator_puzzle_amount"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_effective_tariff(api_key_id: int) -> dict | None:
    """Return the API key company's tariff."""

    conn = get_connection()
    company_tariff = conn.execute(
        """
        SELECT ct.*
        FROM api_keys ak
        JOIN company_tariffs ct ON ct.company_id = ak.company_id
        WHERE ak.id = ?
        """,
        (api_key_id,),
    ).fetchone()
    conn.close()
    if not company_tariff:
        return None
    return _company_tariff_to_dict(company_tariff)


def get_usage_effective_tariff(api_key_id: int, company_id: int | None) -> dict | None:
    """Return the usage company tariff, falling back to the API key company."""

    conn = get_connection()
    if company_id is not None:
        company_tariff = conn.execute(
            """
            SELECT *
            FROM company_tariffs
            WHERE company_id = ?
            """,
            (company_id,),
        ).fetchone()
        if company_tariff:
            conn.close()
            return _company_tariff_to_dict(company_tariff)
    company_tariff = conn.execute(
        """
        SELECT ct.*
        FROM api_keys ak
        JOIN company_tariffs ct ON ct.company_id = ak.company_id
        WHERE ak.id = ?
        """,
        (api_key_id,),
    ).fetchone()
    conn.close()
    if not company_tariff:
        return None
    return _company_tariff_to_dict(company_tariff)
