from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_invoice_list_includes_operator_executor_profit_calculation(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.invoices import list_invoices

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Profit Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Executor", "manager", 1, 0, _now()),
    )
    executor_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO user_executor_companies (user_id, company_id, active, created_at) VALUES (?, ?, 1, ?)",
        (executor_user_id, company_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 700, 100, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO operators (uuid, nickname, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?, ?)",
        ("op-profit", "Operator", _now(), 10, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, user_id, company_id) VALUES (?, ?, ?, ?, ?)",
        ("profit-key", "Master", _now(), executor_user_id, company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO invoices
            (invoice_number, company, is_open, debt_amount, percent_amount, tax_amount, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("INV-PROFIT-1", "Profit Co", 0, 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, price, paid, invoice_id, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (api_key_id, "res-profit", "confirmed", _now(), 1000, 0, invoice_id, company_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for icon_position in range(4):
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, "captcha-profit", operator_id, icon_position, 10, 20, _now()),
        )
    conn.commit()
    conn.close()

    invoice = next(row for row in list_invoices() if row["id"] == invoice_id)

    assert invoice["operator_icons"] == 4
    assert invoice["operator_amount"] == 40.0
    assert invoice["executor_count"] == 1
    assert invoice["executor_amount"] == 100.0
    assert invoice["side_payout_amount"] == 140.0
    assert invoice["profit_amount"] == 860.0
