"""Company entity repository.

Provides CRUD operations for the companies table, plus
name/alias-based lookup and get-or-create helpers.
"""

import json
import logging
from datetime import UTC, datetime

from src.entities import Company, CompanyTariff, get_session
from src.repositories import tariff_repo
from src.repositories.tariff_repo import tariff_to_dict

logger = logging.getLogger("eopp.company_repo")


def _company_to_dict(c: Company, tariff: CompanyTariff | None = None) -> dict:
    data = {
        "id": c.id,
        "name": c.name,
        "aliases": json.loads(c.aliases) if c.aliases else None,
        "notes": c.notes,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }
    if tariff:
        data["tariff"] = tariff_to_dict(tariff, source="company", company_id=c.id)
    return data


def create_company(
    name: str,
    aliases: list[str] | None = None,
    notes: str | None = None,
) -> Company:
    """Create a new company.  *name* must be non-empty and unique."""
    now = datetime.now(UTC).isoformat()
    aliases_json = json.dumps(aliases, ensure_ascii=False) if aliases else None
    with get_session() as session:
        c = Company(
            name=name,
            aliases=aliases_json,
            notes=notes,
            created_at=now,
        )
        session.add(c)
        session.flush()
        session.commit()
        session.refresh(c)
        tariff_repo.apply_default_company_tariff(c.id)
        tariff_repo.apply_default_company_billing_settings(c.name)
        return c


def list_companies(company_id: int | None = None) -> list[dict]:
    """Return all companies ordered by name."""
    with get_session() as session:
        query = session.query(Company)
        if company_id is not None:
            query = query.filter(Company.id == company_id)
        rows = query.outerjoin(CompanyTariff, CompanyTariff.company_id == Company.id)
        rows = rows.with_entities(Company, CompanyTariff).order_by(Company.name).all()
        return [_company_to_dict(company, tariff) for company, tariff in rows]


def get_company(company_id: int) -> Company | None:
    with get_session() as session:
        return session.get(Company, company_id)


def get_company_by_name(name: str) -> Company | None:
    with get_session() as session:
        return session.query(Company).filter(Company.name == name).first()


def find_company_by_name_or_alias(name: str | None) -> Company | None:
    """Look up a company by exact name or any of its aliases (JSON array)."""
    if not name:
        return None
    clean = " ".join(name.split())
    with get_session() as session:
        # 1) exact name match
        c = session.query(Company).filter(Company.name == clean).first()
        if c:
            return c
        # 2) scan aliases column
        all_companies = session.query(Company).filter(Company.aliases.isnot(None)).all()
        for c in all_companies:
            try:
                alias_list = json.loads(c.aliases)
                if isinstance(alias_list, list) and clean in alias_list:
                    return c
            except (json.JSONDecodeError, TypeError):
                pass
        return None


def update_company(company_id: int, **kwargs) -> Company | None:
    """Update fields: name, aliases, notes.  Returns updated Company or None."""
    with get_session() as session:
        c = session.get(Company, company_id)
        if not c:
            return None
        now = datetime.now(UTC).isoformat()
        if "name" in kwargs and kwargs["name"] is not None:
            c.name = kwargs["name"]
        if "aliases" in kwargs:
            val = kwargs["aliases"]
            c.aliases = json.dumps(val, ensure_ascii=False) if val else None
        if "notes" in kwargs:
            c.notes = kwargs["notes"]
        c.updated_at = now
        session.commit()
        session.refresh(c)
        return c


def delete_company(company_id: int) -> bool:
    with get_session() as session:
        c = session.get(Company, company_id)
        if not c:
            return False
        session.delete(c)
        session.commit()
        return True


def get_or_create_company(name: str | None) -> Company | None:
    """Find a company by name or aliases; if not found, create it.

    Returns None when *name* is falsy (so callers can gracefully skip).
    """
    if not name:
        return None
    clean = " ".join(name.split())
    existing = find_company_by_name_or_alias(clean)
    if existing:
        return existing
    logger.info("get_or_create_company: creating new company name=%r", clean)
    return create_company(name=clean)
