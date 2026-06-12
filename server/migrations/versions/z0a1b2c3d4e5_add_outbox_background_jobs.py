"""add durable outbox and background jobs

Revision ID: z0a1b2c3d4e5
Revises: c6529e5db8b7, h7i8j9k0l1m2, y9z0a1b2c3d4
Create Date: 2026-06-11 00:00:04.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "z0a1b2c3d4e5"
down_revision: str | Sequence[str] | None = (
    "c6529e5db8b7",
    "h7i8j9k0l1m2",
    "y9z0a1b2c3d4",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    """Return whether a SQLite table already exists for idempotent migration runs."""
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ).fetchone()
    return row is not None


def _index_exists(index_name: str) -> bool:
    """Return whether a SQLite index already exists for idempotent migration runs."""
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='index' AND name='{index_name}'"
    ).fetchone()
    return row is not None


def upgrade() -> None:
    """Create durable outbox and background job tables if they are missing."""

    if not _table_exists("outbox_events"):
        op.create_table(
            "outbox_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_type", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("idempotency_key", sa.Text(), nullable=True),
            sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_retry_at", sa.Text(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.Text(), nullable=False),
            sa.Column("published_at", sa.Text(), nullable=True),
        )
    if not _index_exists("idx_outbox_events_status_retry"):
        op.create_index(
            "idx_outbox_events_status_retry",
            "outbox_events",
            ["status", "next_retry_at"],
        )
    if not _index_exists("uq_outbox_events_idempotency"):
        op.create_index(
            "uq_outbox_events_idempotency",
            "outbox_events",
            ["idempotency_key"],
            unique=True,
        )

    if not _table_exists("background_jobs"):
        op.create_table(
            "background_jobs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("job_name", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("idempotency_key", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_retry_at", sa.Text(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.Text(), nullable=False),
            sa.Column("locked_at", sa.Text(), nullable=True),
            sa.Column("completed_at", sa.Text(), nullable=True),
        )
    if not _index_exists("uq_background_jobs_idempotency"):
        op.create_index(
            "uq_background_jobs_idempotency",
            "background_jobs",
            ["idempotency_key"],
            unique=True,
        )
    if not _index_exists("idx_background_jobs_status_retry"):
        op.create_index(
            "idx_background_jobs_status_retry",
            "background_jobs",
            ["status", "next_retry_at"],
        )
    if not _index_exists("idx_background_jobs_name"):
        op.create_index("idx_background_jobs_name", "background_jobs", ["job_name"])


def downgrade() -> None:
    """Drop durable outbox/background job tables and indexes."""

    for idx_name in [
        "idx_background_jobs_name",
        "idx_background_jobs_status_retry",
        "uq_background_jobs_idempotency",
    ]:
        try:
            op.drop_index(idx_name, table_name="background_jobs")
        except Exception:
            pass
    if _table_exists("background_jobs"):
        op.drop_table("background_jobs")

    for idx_name in [
        "uq_outbox_events_idempotency",
        "idx_outbox_events_status_retry",
    ]:
        try:
            op.drop_index(idx_name, table_name="outbox_events")
        except Exception:
            pass
    if _table_exists("outbox_events"):
        op.drop_table("outbox_events")
