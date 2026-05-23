"""Per-company billing settings."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert

from src.db.core import company_billing_settings_table, get_engine
from src.dto.billing import CompanyBillingSettingsDTO


def _row_to_dto(row) -> CompanyBillingSettingsDTO:
    return CompanyBillingSettingsDTO(
        company=row["company"],
        auto_invoice_reopen=bool(row["auto_invoice_reopen"]),
        updated_at=row["updated_at"],
    )


def get_company_billing_settings(company: str) -> dict:
    stmt = (
        select(
            company_billing_settings_table.c.company,
            company_billing_settings_table.c.auto_invoice_reopen,
            company_billing_settings_table.c.updated_at,
        )
        .where(company_billing_settings_table.c.company == company)
    )
    with get_engine().connect() as conn:
        row = conn.execute(stmt).mappings().first()
    if not row:
        return CompanyBillingSettingsDTO(
            company=company,
            auto_invoice_reopen=False,
            updated_at=None,
        ).to_dict()
    return _row_to_dto(row).to_dict()


def list_company_billing_settings() -> list[dict]:
    stmt = (
        select(
            company_billing_settings_table.c.company,
            company_billing_settings_table.c.auto_invoice_reopen,
            company_billing_settings_table.c.updated_at,
        )
        .order_by(company_billing_settings_table.c.company.asc())
    )
    with get_engine().connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [_row_to_dto(row).to_dict() for row in rows]


def upsert_company_billing_settings(company: str, auto_invoice_reopen: bool) -> dict:
    now = datetime.now(UTC).isoformat()
    stmt = insert(company_billing_settings_table).values(
        company=company,
        auto_invoice_reopen=bool(auto_invoice_reopen),
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[company_billing_settings_table.c.company],
        set_={
            "auto_invoice_reopen": bool(auto_invoice_reopen),
            "updated_at": now,
        },
    )
    with get_engine().begin() as conn:
        conn.execute(stmt)
    with get_engine().connect() as conn:
        row = conn.execute(
            select(
                company_billing_settings_table.c.company,
                company_billing_settings_table.c.auto_invoice_reopen,
                company_billing_settings_table.c.updated_at,
            ).where(company_billing_settings_table.c.company == company)
        ).mappings().first()
    return _row_to_dto(row).to_dict()
