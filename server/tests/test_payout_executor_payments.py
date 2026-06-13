from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_executor_payments_are_calculated_before_director_shares(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import calculate_payout

    conn = get_connection()
    conn.execute(
        "INSERT INTO companies (name, created_at) VALUES (?, ?)",
        ("Executor Co", _now()),
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Director", "manager", 1, 1, _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Executor", "manager", 1, 0, _now()),
    )
    executor_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO user_executor_companies (user_id, company_id, active, created_at)
        VALUES (?, ?, 1, ?)
        """,
        (executor_user_id, company_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, price_create_peak, price_custom_slots, executor_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 700, None, None, 120, _now(), _now()),
    )
    conn.execute(
        """
        INSERT INTO api_keys (key, label, created_at, user_id, company_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        ("executor-key", "Master", _now(), director_id, company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO invoices
            (invoice_number, company, is_open, debt_amount, percent_amount, tax_amount, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("INV-EXEC-1", "Executor Co", 0, 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for idx in range(2):
        conn.execute(
            """
            INSERT INTO usage_log
                (api_key_id, reservation_id, status, created_at, price, paid, invoice_id, company_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (api_key_id, f"res-exec-{idx}", "confirmed", _now(), 1000, 0, invoice_id, company_id),
        )
    conn.commit()
    conn.close()

    result = calculate_payout(
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )

    shares = {share["user_id"]: share for share in result["payout_shares"]}
    assert result["total_executor_amount"] == 240.0
    assert shares[executor_user_id]["executor_count"] == 2
    assert shares[executor_user_id]["executor_amount"] == 240.0
    assert shares[executor_user_id]["total"] == 240.0
    assert shares[director_id]["profit_share"] == 760.0
