from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_profit_shares_are_paid_only_to_directors(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import calculate_payout

    conn = get_connection()
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Director", "manager", 1, 1, _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Finance", "manager", 1, 0, _now()),
    )
    finance_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO invoices
            (invoice_number, company, is_open, debt_amount, percent_amount, tax_amount, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("INV-DIRECTORS-1", "Acme", 0, 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    result = calculate_payout(
        [invoice_id],
        [],
        [
            {"user_id": director_id, "split_pct": 50},
            {"user_id": finance_id, "split_pct": 50},
        ],
    )

    shares = {share["user_id"]: share for share in result["payout_shares"]}
    assert shares[director_id]["profit_share"] == 1000
    assert shares[director_id]["split_pct"] == 100.0
    assert shares[finance_id]["profit_share"] == 0.0
    assert shares[finance_id]["split_pct"] == 0.0
