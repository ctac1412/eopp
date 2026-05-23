"""Shared SQLAlchemy Core metadata for billing-related tables."""

from sqlalchemy import Boolean, Column, Integer, MetaData, String, Table, Text, create_engine

import src.db.connection as conn_module

metadata = MetaData()


def get_engine():
    return create_engine(f"sqlite:///{conn_module.DB_PATH}", future=True)

company_billing_settings_table = Table(
    "company_billing_settings",
    metadata,
    Column("company", String, primary_key=True),
    Column("auto_invoice_reopen", Boolean, nullable=False, default=False),
    Column("updated_at", Text, nullable=True),
)

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
