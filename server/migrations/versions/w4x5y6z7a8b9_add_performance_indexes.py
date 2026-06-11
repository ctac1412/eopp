"""add performance indexes

Revision ID: w4x5y6z7a8b9
Revises: v3w4x5y6z7a8
Create Date: 2026-06-11 00:00:01.000000

Indexes:
  - idx_usage_log_api_key ON usage_log(api_key_id)
  - idx_usage_log_company ON usage_log(company)
  - idx_captchas_usage_log ON captchas(usage_log_id)
  - idx_payouts_status ON payouts(status)
  - idx_payout_shares_payout ON payout_shares(payout_id)

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'w4x5y6z7a8b9'
down_revision: Union[str, Sequence[str], None] = 'v3w4x5y6z7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    row = conn.exec_driver_sql(
        f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ).fetchone()
    return row is not None


def upgrade() -> None:
    indexes = {
        "usage_log": [
            ("idx_usage_log_api_key", "api_key_id"),
            ("idx_usage_log_company", "company"),
        ],
        "captchas": [
            ("idx_captchas_usage_log", "usage_log_id"),
        ],
        "payouts": [
            ("idx_payouts_status", "status"),
        ],
        "payout_shares": [
            ("idx_payout_shares_payout", "payout_id"),
        ],
    }

    conn = op.get_bind()
    for table, cols in indexes.items():
        if not _table_exists(table):
            continue
        for idx_name, col_name in cols:
            existing = conn.exec_driver_sql(
                f"SELECT 1 FROM sqlite_master WHERE type='index' AND name='{idx_name}'"
            ).fetchone()
            if not existing:
                op.create_index(idx_name, table, [col_name])


def downgrade() -> None:
    for idx_name in [
        "idx_usage_log_api_key",
        "idx_usage_log_company",
        "idx_captchas_usage_log",
        "idx_payouts_status",
        "idx_payout_shares_payout",
    ]:
        try:
            op.drop_index(idx_name)
        except Exception:
            pass
