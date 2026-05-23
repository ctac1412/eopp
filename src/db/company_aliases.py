"""Company aliases and normalization."""

from sqlalchemy import select

from src.db.core import company_aliases_table, get_engine


def normalize_company(company: str | None) -> str | None:
    if not company:
        return company
    normalized = " ".join(company.split())
    with get_engine().connect() as conn:
        row = (
            conn.execute(
                select(company_aliases_table.c.company).where(
                    company_aliases_table.c.alias == normalized
                )
            )
            .mappings()
            .first()
        )
    return row["company"] if row else normalized
