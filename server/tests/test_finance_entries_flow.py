from datetime import UTC, datetime


def _now() -> str:
    return datetime.now(UTC).isoformat()


def test_billing_job_creates_idempotent_finance_entries(isolated_api_db, monkeypatch):
    from src.db.connection import get_connection
    from src.modules.billing.jobs import calculate_usage_price

    monkeypatch.setattr("src.modules.billing.jobs._defer_job", lambda *_args, **_kwargs: None)

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Ledger Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Executor", "manager", 1, 0, _now()),
    )
    executor_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO user_executor_companies (user_id, company_id, active, created_at) VALUES (?, ?, 1, ?)",
        (executor_user_id, company_id, _now()),
    )
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, nickname, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-ledger", "Operator", _now(), 75, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (company_id, 2730, 700, 500, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("ledger-key", "Ledger", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, config_json, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, 0)
        """,
        (api_key_id, "res-ledger", _now(), _now(), '{"mode":"create"}', company_id, "Ledger Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for icon_position in range(2):
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, "captcha-ledger", operator_id, icon_position, 10, 20, _now()),
        )
    conn.commit()
    conn.close()

    calculate_usage_price({"usage_log_id": usage_log_id})
    calculate_usage_price({"usage_log_id": usage_log_id})

    conn = get_connection()
    rows = conn.execute(
        """
        SELECT kind, amount, user_id, usage_log_id, distribution_answer_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"]) for row in rows] == [
        ("customer_income", 2730),
        ("executor_salary", -500),
        ("operator_salary", -75),
        ("operator_salary", -75),
    ]
    assert sum(1 for row in rows if row["user_id"] == executor_user_id) == 1
    assert sum(1 for row in rows if row["user_id"] == operator_user_id) == 2


def test_invoice_links_all_usage_entries_and_creates_profit_lot(isolated_api_db):
    from src.db.connection import get_connection
    from src.services.invoice_service import generate_invoice
    from src.models import GenerateInvoiceBody

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Invoice Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("invoice-key", "Invoice", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, ?, ?, 0)
        """,
        (api_key_id, "res-invoice", _now(), _now(), company_id, "Invoice Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
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
    entries = [
        ("customer_income", 2730, None, f"usage:{usage_log_id}:income"),
        ("executor_salary", -500, executor_user_id, f"usage:{usage_log_id}:executor"),
        ("operator_salary", -150, operator_user_id, f"usage:{usage_log_id}:operator:test"),
    ]
    for kind, amount, user_id, source_key in entries:
        conn.execute(
            """
            INSERT INTO finance_entries
                (company_id, usage_log_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'open', 'test', ?, ?, ?)
            """,
            (company_id, usage_log_id, user_id, kind, amount, source_key, _now(), _now()),
        )
    conn.commit()
    conn.close()

    status, invoice = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=[usage_log_id],
            percent_rate=5,
            tax_rate=4,
            debt_amount=2730,
            percent_amount=150,
            tax_amount=120,
            total_amount=3000,
        )
    )

    assert status == 200
    conn = get_connection()
    linked = conn.execute(
        "SELECT COUNT(*) AS cnt FROM finance_entries WHERE usage_log_id = ? AND invoice_id = ?",
        (usage_log_id, invoice["invoice_id"]),
    ).fetchone()
    lot = conn.execute(
        "SELECT gross_amount FROM profit_lots WHERE usage_log_id = ? AND invoice_id = ?",
        (usage_log_id, invoice["invoice_id"]),
    ).fetchone()
    conn.close()

    assert linked["cnt"] == 5
    assert lot["gross_amount"] == 2080


def test_expense_repayment_uses_profit_lot_without_remaining_mutation(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_expense_repayments

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Expense Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO invoices (invoice_number, company, paid, created_at) VALUES (?, ?, 1, ?)", ("INV-EXP", "Expense Co", _now()))
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)", ("expense-key", "Expense", _now(), company_id))
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-expense", _now(), _now(), company_id, "Expense Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 2080, _now(), _now()),
    )
    profit_lot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO expenses (amount, reason, created_at) VALUES (?, ?, ?)", (15000, "Server", _now()))
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO payouts (name, status, created_at) VALUES (?, 'pending', ?)", ("Payout", _now()))
    payout_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    create_expense_repayments(payout_id, [{"expense_id": expense_id, "amount": 1000}])

    conn = get_connection()
    repayment = conn.execute(
        "SELECT * FROM finance_entries WHERE kind = 'expense_repayment' AND expense_id = ?",
        (expense_id,),
    ).fetchone()
    columns = [row["name"] for row in conn.execute("PRAGMA table_info(profit_lots)").fetchall()]
    available = conn.execute(
        """
        SELECT pl.gross_amount + COALESCE(SUM(fe.amount), 0) AS available
        FROM profit_lots pl
        LEFT JOIN finance_entries fe ON fe.profit_lot_id = pl.id
        WHERE pl.id = ?
        GROUP BY pl.id
        """,
        (profit_lot_id,),
    ).fetchone()
    conn.close()

    assert repayment["amount"] == -1000
    assert repayment["profit_lot_id"] == profit_lot_id
    assert repayment["usage_log_id"] == usage_log_id
    assert "remaining_amount" not in columns
    assert available["available"] == 1080


def test_open_finance_entry_can_be_updated_but_locked_cannot(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_manual_entry, update_finance_entry

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Edit Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    entry = create_manual_entry(
        {
            "company_id": company_id,
            "kind": "manual_adjustment",
            "amount": 100,
            "comment": "initial",
        }
    )
    updated = update_finance_entry(entry["id"], {"amount": 250, "comment": "changed"})

    conn = get_connection()
    conn.execute("UPDATE finance_entries SET edit_state = 'locked' WHERE id = ?", (entry["id"],))
    conn.commit()
    conn.close()

    locked = update_finance_entry(entry["id"], {"amount": 300})

    assert updated["amount"] == 250
    assert updated["comment"] == "changed"
    assert locked is None


def test_payout_uses_finance_entries_and_profit_lots_for_paid_invoice(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import calculate_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Payout Ledger Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    users = {}
    for name, role, is_director in [
        ("Director", "manager", 1),
        ("Executor", "manager", 0),
        ("Operator", "operator", 0),
        ("Commission", "manager", 0),
        ("Tax", "manager", 0),
    ]:
        conn.execute(
            "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, ?, ?)",
            (name, role, is_director, _now()),
        )
        users[name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-LEDGER-PAYOUT", "Payout Ledger Co", 2730, 150, 120, 3000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)", ("payout-ledger-key", "Payout", _now(), company_id))
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-payout-ledger", _now(), _now(), company_id, "Payout Ledger Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    entries = [
        ("customer_income", 2730, None, f"usage:{usage_log_id}:income"),
        ("executor_salary", -500, users["Executor"], f"usage:{usage_log_id}:executor"),
        ("operator_salary", -150, users["Operator"], f"operator-answer:test:{usage_log_id}"),
        ("invoice_commission", -150, users["Commission"], f"invoice:{invoice_id}:commission:usage:{usage_log_id}"),
        ("invoice_tax", -120, users["Tax"], f"invoice:{invoice_id}:tax:usage:{usage_log_id}"),
    ]
    for kind, amount, user_id, source_key in entries:
        conn.execute(
            """
            INSERT INTO finance_entries
                (company_id, usage_log_id, invoice_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', 'test', ?, ?, ?)
            """,
            (company_id, usage_log_id, invoice_id, user_id, kind, amount, source_key, _now(), _now()),
        )
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 2080, _now(), _now()),
    )
    conn.commit()
    conn.close()

    result = calculate_payout(
        [invoice_id],
        [],
        [{"user_id": users["Director"], "split_pct": 100}],
    )

    shares = {share["user_id"]: share for share in result["payout_shares"]}
    assert shares[users["Executor"]]["executor_amount"] == 500.0
    assert shares[users["Operator"]]["operator_amount"] == 150.0
    assert shares[users["Commission"]]["commission_amount"] == 150.0
    assert shares[users["Tax"]]["tax_amount"] == 120.0
    assert shares[users["Director"]]["profit_share"] == 2080.0
    assert result["net"] == 2080.0


def test_create_payout_locks_linked_finance_entries(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import create_payout_with_calculation

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Lock Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Executor", "manager", _now()),
    )
    executor_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?)",
        ("INV-LOCK", "Lock Co", 1000, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)", ("lock-key", "Lock", _now(), company_id))
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-lock", _now(), _now(), company_id, "Lock Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for kind, amount, user_id, key_suffix in [
        ("customer_income", 1000, None, "income"),
        ("executor_salary", -100, executor_id, "executor"),
    ]:
        conn.execute(
            """
            INSERT INTO finance_entries
                (company_id, usage_log_id, invoice_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', 'test', ?, ?, ?)
            """,
            (company_id, usage_log_id, invoice_id, user_id, kind, amount, f"lock:{usage_log_id}:{key_suffix}", _now(), _now()),
        )
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 900, _now(), _now()),
    )
    conn.commit()
    conn.close()

    payout = create_payout_with_calculation(
        "Lock payout",
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )

    conn = get_connection()
    states = conn.execute(
        "SELECT DISTINCT edit_state, payout_id FROM finance_entries WHERE usage_log_id = ?",
        (usage_log_id,),
    ).fetchall()
    director_entries = conn.execute(
        """
        SELECT fe.kind, fe.user_id, fe.amount, fe.edit_state, fe.payout_id, fe.profit_lot_id,
               pl.gross_amount + COALESCE(SUM(applied.amount), 0) AS lot_available
        FROM finance_entries fe
        JOIN profit_lots pl ON pl.id = fe.profit_lot_id
        LEFT JOIN finance_entries applied ON applied.profit_lot_id = pl.id
        WHERE fe.kind = 'director_profit'
          AND fe.usage_log_id = ?
        GROUP BY fe.id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert payout["id"] is not None
    assert {(row["edit_state"], row["payout_id"]) for row in states} == {("locked", payout["id"])}
    assert len(director_entries) == 1
    director_entry = director_entries[0]
    assert director_entry["user_id"] == director_id
    assert director_entry["amount"] == -900
    assert director_entry["edit_state"] == "locked"
    assert director_entry["payout_id"] == payout["id"]
    assert director_entry["profit_lot_id"] is not None
    assert director_entry["lot_available"] == 0


def test_completed_payout_marks_finance_entries_paid(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import create_payout_with_calculation, set_payout_status

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Paid Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?)",
        ("INV-PAID", "Paid Co", 500, 500, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("paid-key", "Paid", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-paid", _now(), _now(), company_id, "Paid Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, usage_log_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, 'customer_income', 500, 'open', 'test', ?, ?, ?)
        """,
        (company_id, usage_log_id, invoice_id, f"paid:{usage_log_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 500, _now(), _now()),
    )
    conn.commit()
    conn.close()

    payout = create_payout_with_calculation(
        "Paid payout",
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )
    result = set_payout_status(payout["id"], "completed")

    conn = get_connection()
    states = conn.execute(
        "SELECT DISTINCT edit_state FROM finance_entries WHERE payout_id = ?",
        (payout["id"],),
    ).fetchall()
    conn.close()

    assert result["status"] == "completed"
    assert {row["edit_state"] for row in states} == {"paid"}


def test_recalculate_pending_payout_rebuilds_ledger_locks(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import create_payout_with_calculation, recalculate_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Recalc Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?)",
        ("INV-RECALC", "Recalc Co", 800, 800, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("recalc-key", "Recalc", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-recalc", _now(), _now(), company_id, "Recalc Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, usage_log_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, 'customer_income', 800, 'open', 'test', ?, ?, ?)
        """,
        (company_id, usage_log_id, invoice_id, f"recalc:{usage_log_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 800, _now(), _now()),
    )
    conn.commit()
    conn.close()

    payout = create_payout_with_calculation(
        "Recalc payout",
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )
    result = recalculate_payout(
        payout["id"],
        [invoice_id],
        [],
        [{"user_id": director_id, "split_pct": 100}],
    )

    conn = get_connection()
    rows = conn.execute(
        "SELECT kind, amount, edit_state, payout_id FROM finance_entries WHERE usage_log_id = ? ORDER BY kind",
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert result["shares"][0]["profit_share"] == 800
    assert [(row["kind"], row["amount"], row["edit_state"], row["payout_id"]) for row in rows] == [
        ("customer_income", 800, "locked", payout["id"]),
        ("director_profit", -800, "locked", payout["id"]),
    ]


def test_finance_report_aggregates_entries_without_profit_lot_double_count(isolated_api_db):
    from src.db.connection import get_connection
    from src.services.reporting_service import build_finance_report

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Report Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    user_ids = []
    for name, role, is_director in [
        ("Executor", "manager", 0),
        ("Operator", "operator", 0),
        ("Director", "manager", 1),
    ]:
        conn.execute(
            "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, ?, ?)",
            (name, role, is_director, _now()),
        )
        user_ids.append(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    executor_id, operator_id, director_id = user_ids
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?)",
        ("INV-REPORT", "Report Co", 3000, 3000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("report-key", "Report", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-report", _now(), _now(), company_id, "Report Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 2080, _now(), _now()),
    )
    profit_lot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    rows = [
        ("customer_income", 3000, None, None),
        ("executor_salary", -500, executor_id, None),
        ("operator_salary", -150, operator_id, None),
        ("invoice_commission", -150, None, None),
        ("invoice_tax", -120, None, None),
        ("director_profit", -2080, director_id, profit_lot_id),
    ]
    for idx, (kind, amount, user_id, lot_id) in enumerate(rows):
        conn.execute(
            """
            INSERT INTO finance_entries
                (company_id, usage_log_id, invoice_id, profit_lot_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', 'test', ?, ?, ?)
            """,
            (company_id, usage_log_id, invoice_id, lot_id, user_id, kind, amount, f"report:{idx}", _now(), _now()),
        )
    conn.commit()
    conn.close()

    report = build_finance_report()

    assert report["totals"]["customer_income"] == 3000
    assert report["totals"]["executor_salary"] == 500
    assert report["totals"]["operator_salary"] == 150
    assert report["totals"]["invoice_commission"] == 150
    assert report["totals"]["invoice_tax"] == 120
    assert report["totals"]["director_profit"] == 2080
    assert report["totals"]["profit_lots_gross"] == 2080
    assert report["totals"]["net_profit_remaining"] == 0
    assert sum(report["totals"].values()) != 5080
    assert report["users"][str(executor_id)]["executor_salary"] == 500
    assert report["users"][str(operator_id)]["operator_salary"] == 150
    assert report["users"][str(director_id)]["director_profit"] == 2080
