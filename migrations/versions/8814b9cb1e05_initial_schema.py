"""initial schema — все 11 таблиц

Revision ID: 8814b9cb1e05
Revises:
Create Date: 2026-05-18
"""

from datetime import UTC, datetime

from alembic import op

revision = "8814b9cb1e05"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            usage_count INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            comment TEXT
        )
    """)

    op.execute("""
        CREATE TABLE usage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER NOT NULL,
            reservation_id TEXT NOT NULL,
            captcha_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            error_stage TEXT,
            slot_date TEXT,
            created_at TEXT NOT NULL,
            confirmed_at TEXT,
            price INTEGER,
            paid INTEGER,
            invoice_id INTEGER REFERENCES invoices(id),
            logs TEXT,
            config_json TEXT,
            op_type TEXT,
            company TEXT,
            fio TEXT,
            vehicle_number TEXT,
            is_test INTEGER DEFAULT 0,
            invoice_number TEXT
        )
    """)

    op.execute("""
        CREATE TABLE tariffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id INTEGER UNIQUE NOT NULL,
            price_create INTEGER NOT NULL,
            price_reschedule INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        )
    """)

    op.execute("""
        CREATE TABLE invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            comment TEXT DEFAULT '',
            percent_rate REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            debt_amount INTEGER DEFAULT 0,
            percent_amount INTEGER DEFAULT 0,
            tax_amount INTEGER DEFAULT 0,
            total_amount INTEGER DEFAULT 0,
            pdf_path TEXT,
            paid INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    op.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount INTEGER NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            comment TEXT DEFAULT '',
            user_id INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE payouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
    """)

    op.execute("""
        CREATE TABLE payout_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payout_id INTEGER NOT NULL,
            user_id INTEGER REFERENCES users(id),
            split_pct REAL DEFAULT 0,
            expenses_compensation REAL DEFAULT 0,
            profit_share REAL DEFAULT 0,
            total REAL DEFAULT 0,
            FOREIGN KEY (payout_id) REFERENCES payouts(id)
        )
    """)

    op.execute("""
        CREATE TABLE payout_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payout_id INTEGER NOT NULL,
            invoice_id INTEGER REFERENCES invoices(id),
            amount REAL DEFAULT 0,
            FOREIGN KEY (payout_id) REFERENCES payouts(id),
            UNIQUE(payout_id, invoice_id)
        )
    """)

    op.execute("""
        CREATE TABLE payout_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payout_id INTEGER NOT NULL,
            expense_id INTEGER REFERENCES expenses(id),
            amount REAL DEFAULT 0,
            FOREIGN KEY (payout_id) REFERENCES payouts(id)
        )
    """)

    # Seed admin key
    now = datetime.now(UTC).isoformat()
    op.execute(
        "INSERT OR IGNORE INTO api_keys (key, label, created_at, max_uses, active) "
        "VALUES ('13243546', 'admin', '{}', NULL, 1)".format(now)
    )

    # Seed users
    op.execute(
        "INSERT OR IGNORE INTO users (name, created_at) VALUES ('Солнышко', '{}')".format(now)
    )
    op.execute(
        "INSERT OR IGNORE INTO users (name, created_at) VALUES ('Буйвол', '{}')".format(now)
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payout_expenses")
    op.execute("DROP TABLE IF EXISTS payout_invoices")
    op.execute("DROP TABLE IF EXISTS payout_shares")
    op.execute("DROP TABLE IF EXISTS payouts")
    op.execute("DROP TABLE IF EXISTS expenses")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS invoices")
    op.execute("DROP TABLE IF EXISTS tariffs")
    op.execute("DROP TABLE IF EXISTS usage_log")
    op.execute("DROP TABLE IF EXISTS api_keys")
