from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _seed_invoice_graph(edit_state: str = "open") -> dict[str, int]:
    from src.db.connection import get_connection

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Delete Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, total_amount, created_at) VALUES (?, ?, 0, ?, ?, ?)",
        (f"INV-DELETE-{edit_state}", "Delete Co", 1000, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoice_items (invoice_id, description, amount, sort_order) VALUES (?, ?, ?, ?)",
        (invoice_id, "Line", 1000, 0),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        (f"delete-key-{edit_state}", "Delete", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id, paid)
        VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, 1)
        """,
        (api_key_id, f"res-delete-{edit_state}", _now(), _now(), company_id, "Delete Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (company_id, usage_log_id, invoice_id, 1000, _now(), _now()),
    )
    profit_lot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, usage_log_id, invoice_id, profit_lot_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'customer_income', 1000, ?, 'test', ?, ?, ?)
        """,
        (
            company_id,
            usage_log_id,
            invoice_id,
            profit_lot_id,
            edit_state,
            f"delete:{invoice_id}:{edit_state}",
            _now(),
            _now(),
        ),
    )
    conn.commit()
    conn.close()
    return {
        "company_id": company_id,
        "invoice_id": invoice_id,
        "usage_log_id": usage_log_id,
        "profit_lot_id": profit_lot_id,
    }


def test_delete_invoice_removes_disposable_children_and_unlinks_usage(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.invoices import delete_invoice

    ids = _seed_invoice_graph()

    assert delete_invoice(ids["invoice_id"]) is True

    conn = get_connection()
    usage = conn.execute(
        "SELECT invoice_id, paid FROM usage_log WHERE id = ?",
        (ids["usage_log_id"],),
    ).fetchone()
    counts = {
        "invoices": conn.execute(
            "SELECT COUNT(*) AS cnt FROM invoices WHERE id = ?",
            (ids["invoice_id"],),
        ).fetchone()["cnt"],
        **{
            table: conn.execute(
                f"SELECT COUNT(*) AS cnt FROM {table} WHERE invoice_id = ?",
                (ids["invoice_id"],),
            ).fetchone()["cnt"]
            for table in ("invoice_items", "profit_lots", "finance_entries")
        },
    }
    conn.close()

    assert counts == {"invoices": 0, "invoice_items": 0, "profit_lots": 0, "finance_entries": 0}
    assert usage["invoice_id"] is None
    assert usage["paid"] == 0


def test_delete_invoice_returns_conflict_when_invoice_is_linked_to_payout(isolated_api_db):
    from src.db.connection import get_connection
    from src.services.invoice_service import delete_invoice

    ids = _seed_invoice_graph()
    conn = get_connection()
    conn.execute("INSERT INTO payouts (name, status, created_at) VALUES (?, 'pending', ?)", ("Payout", _now()))
    payout_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO payout_invoices (payout_id, invoice_id, amount) VALUES (?, ?, ?)",
        (payout_id, ids["invoice_id"], 1000),
    )
    conn.commit()
    conn.close()

    status, payload = delete_invoice(ids["invoice_id"])

    conn = get_connection()
    invoice_exists = conn.execute(
        "SELECT 1 FROM invoices WHERE id = ?",
        (ids["invoice_id"],),
    ).fetchone()
    conn.close()

    assert status == 409
    assert payload == {"error": "Invoice is linked to payout or locked finance entries"}
    assert invoice_exists is not None


def test_delete_invoice_returns_conflict_when_finance_entry_is_locked(isolated_api_db):
    from src.db.connection import get_connection
    from src.services.invoice_service import delete_invoice

    ids = _seed_invoice_graph(edit_state="locked")

    status, payload = delete_invoice(ids["invoice_id"])

    conn = get_connection()
    invoice_exists = conn.execute(
        "SELECT 1 FROM invoices WHERE id = ?",
        (ids["invoice_id"],),
    ).fetchone()
    finance_exists = conn.execute(
        "SELECT 1 FROM finance_entries WHERE invoice_id = ?",
        (ids["invoice_id"],),
    ).fetchone()
    conn.close()

    assert status == 409
    assert payload == {"error": "Invoice is linked to payout or locked finance entries"}
    assert invoice_exists is not None
    assert finance_exists is not None
