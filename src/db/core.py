"""Database core — engine, session, and legacy SQLAlchemy Core table definitions."""

from sqlalchemy import Boolean, Column, Integer, MetaData, String, Table, Text

from src.entities.base import Base, get_engine, get_session, get_session_factory, set_db_path

# Legacy Core metadata — kept for backward compat with existing SQLAlchemy Core code
# New code should use ORM entities from src.entities instead
metadata = MetaData()

prepaid_packages_table = Table(
    "prepaid_packages",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("api_key_id", Integer, nullable=False),
    Column("balance_amount", Integer, nullable=False),
    Column("active", Boolean, nullable=False, default=True),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)

prepaid_deductions_table = Table(
    "prepaid_deductions",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("package_id", Integer, nullable=False),
    Column("usage_log_id", Integer, nullable=False),
    Column("amount", Integer, nullable=False),
    Column("created_at", Text, nullable=False),
)

company_aliases_table = Table(
    "company_aliases",
    metadata,
    Column("alias", String, primary_key=True),
    Column("company", String, nullable=False),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
)


__all__ = [
    "Base",
    "get_engine",
    "get_session",
    "get_session_factory",
    "set_db_path",
    "metadata",
    "prepaid_packages_table",
    "prepaid_deductions_table",
    "company_aliases_table",
]
