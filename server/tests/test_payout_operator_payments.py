from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_operator_icon_payments_are_calculated_before_director_shares(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import calculate_payout

    conn = get_connection()
    conn.execute(
        "INSERT INTO companies (name, created_at) VALUES (?, ?)",
        ("Acme", _now()),
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Director", "manager", 1, 1, _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator User", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO operators (uuid, nickname, created_at, icon_rate, company_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        ("op-pay-1", "Operator", _now(), 25, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at)
        VALUES (?, ?, ?, 1, ?)
        """,
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO api_keys (key, label, created_at, user_id, company_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        ("test-key", "Master", _now(), director_id, company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO invoices
            (invoice_number, company, is_open, debt_amount, percent_amount, tax_amount, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("INV-OP-1", "Acme", 0, 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, price, paid, invoice_id, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (api_key_id, "res-op", "confirmed", _now(), 1000, 0, invoice_id, company_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for icon_position in range(3):
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, "captcha-op", operator_id, icon_position, 10, 20, _now()),
        )
    conn.commit()
    conn.close()

    result = calculate_payout(
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )

    shares = {share["user_id"]: share for share in result["payout_shares"]}
    assert result["total_operator_amount"] == 75.0
    assert shares[operator_user_id]["operator_icons"] == 3
    assert shares[operator_user_id]["operator_amount"] == 75.0
    assert shares[operator_user_id]["total"] == 75.0
    assert shares[director_id]["profit_share"] == 925.0
    assert shares[director_id]["total"] == 925.0
