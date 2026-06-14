from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_admin_profit_lots_lists_allocations(client, admin_token, isolated_api_db):
    from src.db.connection import get_connection

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Lot Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, created_at) VALUES (?, ?, 1, ?)",
        ("INV-LOTS", "Lot Co", _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("lot-key", "Lots", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id)
        VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)
        """,
        (api_key_id, "res-lot", _now(), _now(), company_id, "Lot Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO profit_lots
            (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (company_id, usage_log_id, invoice_id, 1200, _now(), _now()),
    )
    profit_lot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, usage_log_id, invoice_id, profit_lot_id, kind, amount,
             edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'director_profit', -400, 'locked', 'test', ?, ?, ?)
        """,
        (
            company_id,
            usage_log_id,
            invoice_id,
            profit_lot_id,
            f"profit-lot:{profit_lot_id}:director",
            _now(),
            _now(),
        ),
    )
    conn.commit()
    conn.close()

    response = client.get("/admin/profit-lots", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == profit_lot_id
    assert row["company_id"] == company_id
    assert row["usage_log_id"] == usage_log_id
    assert row["invoice_id"] == invoice_id
    assert row["gross_amount"] == 1200
    assert row["allocated_amount"] == 400
    assert row["remaining_amount"] == 800
    assert row["linked_entries_count"] == 1
    assert row["invoice_number"] == "INV-LOTS"
    assert row["company_name"] == "Lot Co"
