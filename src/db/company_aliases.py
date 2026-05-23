"""Company aliases and normalization."""

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert

from src.db.core import company_aliases_table, get_engine
from src.dto.billing import CompanyAliasDTO


def _row_to_dict(row) -> dict:
    return CompanyAliasDTO(
        alias=row["alias"],
        company=row["company"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    ).to_dict()


def normalize_company(company: str | None) -> str | None:
    if not company:
        return company
    normalized = " ".join(company.split())
    with get_engine().connect() as conn:
        row = conn.execute(
            select(company_aliases_table.c.company).where(company_aliases_table.c.alias == normalized)
        ).mappings().first()
    return row["company"] if row else normalized


def list_company_aliases() -> list[dict]:
    stmt = select(company_aliases_table).order_by(company_aliases_table.c.company, company_aliases_table.c.alias)
    with get_engine().connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [_row_to_dict(row) for row in rows]


def upsert_company_alias(alias: str, company: str) -> dict:
    now = datetime.now(UTC).isoformat()
    clean_alias = " ".join(alias.split())
    clean_company = " ".join(company.split())
    stmt = insert(company_aliases_table).values(
        alias=clean_alias,
        company=clean_company,
        created_at=now,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[company_aliases_table.c.alias],
        set_={
            "company": clean_company,
            "updated_at": now,
        },
    )
    with get_engine().begin() as conn:
        conn.execute(stmt)
    with get_engine().connect() as conn:
        row = conn.execute(
            select(company_aliases_table).where(company_aliases_table.c.alias == clean_alias)
        ).mappings().first()
    return _row_to_dict(row)


def delete_company_alias(alias: str) -> bool:
    with get_engine().begin() as conn:
        result = conn.execute(delete(company_aliases_table).where(company_aliases_table.c.alias == alias))
    return result.rowcount > 0
