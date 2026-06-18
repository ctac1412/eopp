from datetime import UTC, datetime
from types import SimpleNamespace


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _non_peak_time() -> str:
    return datetime(2026, 6, 15, 8, 0, tzinfo=UTC).isoformat()


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
        "INSERT INTO operators (uuid, created_at, icon_rate, billing_mode, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-ledger", _now(), 75, "custom", company_id),
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
        "INSERT INTO api_keys (key, label, user_id, created_at, company_id) VALUES (?, ?, ?, ?, ?)",
        ("ledger-key", "Ledger", executor_user_id, _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, config_json, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, 0)
        """,
        (
            api_key_id,
            "res-ledger",
            _non_peak_time(),
            _non_peak_time(),
            '{"mode":"create"}',
            company_id,
            "Ledger Co",
        ),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-ledger", "passed", usage_log_id, _now()),
    )
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


def test_update_usage_price_recalculates_open_finance_entries(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries
    from src.services.billing_service import update_usage_log

    conn = get_connection()
    conn.execute("INSERT INTO api_keys (key, label, created_at) VALUES (?, ?, ?)", ("reprice-key", "Reprice", _now()))
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 100, 0)
        """,
        (api_key_id, "res-reprice", _now(), _now()),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    create_usage_finance_entries(conn, usage_log_id, 100)
    conn.commit()
    conn.close()

    status, updated = update_usage_log(
        usage_log_id,
        SimpleNamespace(price=500, paid=None),
    )

    conn = get_connection()
    rows = conn.execute(
        "SELECT kind, amount FROM finance_entries WHERE usage_log_id = ? ORDER BY id",
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert status == 200
    assert updated["price"] == 500
    assert [(row["kind"], row["amount"]) for row in rows] == [("customer_income", 500)]


def test_operator_salary_uses_company_amount_when_operator_rate_missing(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Operator Fallback Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?)",
        ("operator-fallback", _now(), 0, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 60, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("operator-fallback-key", "Operator fallback", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-operator-fallback", _now(), _now(), company_id, "Operator Fallback Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-operator-fallback", "passed", usage_log_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO distribution_answers
            (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (1, usage_log_id, "captcha-operator-fallback", operator_id, 0, 10, 20, _now()),
    )

    create_usage_finance_entries(conn, usage_log_id, 1000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 1000, None),
        ("operator_salary", -60, operator_user_id),
    ]


def test_operator_salary_uses_custom_operator_billing_mode(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Custom Operator Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, billing_mode, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-custom-billing", _now(), 90, "custom", company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 60, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("custom-operator-key", "Custom operator", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-custom-operator", _now(), _now(), company_id, "Custom Operator Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-custom-operator", "passed", usage_log_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO distribution_answers
            (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (1, usage_log_id, "captcha-custom-operator", operator_id, 0, 10, 20, _now()),
    )

    create_usage_finance_entries(conn, usage_log_id, 1000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 1000, None),
        ("operator_salary", -90, operator_user_id),
    ]


def test_operator_salary_skips_free_operator_billing_mode(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Free Operator Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, billing_mode, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-free-billing", _now(), 120, "free", company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 60, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("free-operator-key", "Free operator", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-free-operator", _now(), _now(), company_id, "Free Operator Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-free-operator", "passed", usage_log_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO distribution_answers
            (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (1, usage_log_id, "captcha-free-operator", operator_id, 0, 10, 20, _now()),
    )

    create_usage_finance_entries(conn, usage_log_id, 1000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 1000, None),
    ]
    assert operator_user_id is not None


def test_operator_company_billing_override_wins_over_global_mode(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    company_ids = {}
    for name, operator_amount in [("Arttrans", 100), ("External", 80)]:
        conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", (name, _now()))
        company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        company_ids[name] = company_id
        conn.execute(
            """
            INSERT INTO company_tariffs
                (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (company_id, 1000, 500, 0, operator_amount, _now(), _now()),
        )

    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Buffalo", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, billing_mode, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-company-override", _now(), 0, "company", company_ids["Arttrans"]),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_ids["Arttrans"], operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO operator_company_billing_overrides
            (operator_id, company_id, billing_mode, icon_rate, created_at, updated_at)
        VALUES (?, ?, 'free', 0, ?, ?)
        """,
        (operator_id, company_ids["Arttrans"], _now(), _now()),
    )

    usage_ids = {}
    for name in ["Arttrans", "External"]:
        conn.execute(
            "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
            (f"{name.lower()}-key", name, _now(), company_ids[name]),
        )
        api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            """
            INSERT INTO usage_log
                (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
            VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
            """,
            (api_key_id, f"res-{name.lower()}", _now(), _now(), company_ids[name], name),
        )
        usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        usage_ids[name] = usage_log_id
        captcha_id = f"captcha-{name.lower()}"
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
            (captcha_id, "passed", usage_log_id, _now()),
        )
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, captcha_id, operator_id, 0, 10, 20, _now()),
        )

    create_usage_finance_entries(conn, usage_ids["Arttrans"], 1000)
    create_usage_finance_entries(conn, usage_ids["External"], 1000)
    rows = conn.execute(
        """
        SELECT usage_log_id, kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id IN (?, ?)
        ORDER BY usage_log_id, kind, id
        """,
        (usage_ids["Arttrans"], usage_ids["External"]),
    ).fetchall()
    conn.close()

    assert [(row["usage_log_id"], row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        (usage_ids["Arttrans"], "customer_income", 1000, None),
        (usage_ids["External"], "customer_income", 1000, None),
        (usage_ids["External"], "operator_salary", -80, operator_user_id),
    ]


def test_operator_salary_is_not_paid_to_usage_executor_for_own_clicks(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Own Clicks Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Executor Operator", "operator", 1, 0, _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO user_executor_companies (user_id, company_id, active, created_at) VALUES (?, ?, 1, ?)",
        (user_id, company_id, _now()),
    )
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?)",
        ("operator-own-clicks", _now(), 70, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 200, 60, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, user_id, created_at, company_id) VALUES (?, ?, ?, ?, ?)",
        ("own-clicks-key", "Own clicks", user_id, _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-own-clicks", _now(), _now(), company_id, "Own Clicks Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-own-clicks", "passed", usage_log_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO distribution_answers
            (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (1, usage_log_id, "captcha-own-clicks", operator_id, 0, 10, 20, _now()),
    )

    create_usage_finance_entries(conn, usage_log_id, 1000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 1000, None),
        ("executor_salary", -200, user_id),
    ]


def test_operator_salary_is_created_only_for_successful_captcha_answers(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Passed Captcha Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?)",
        ("operator-passed-only", _now(), 0, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 75, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("passed-only-key", "Passed only", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-passed-only", _now(), _now(), company_id, "Passed Captcha Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for captcha_id, status in (("captcha-ok", "passed"), ("captcha-failed", "failed")):
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
            (captcha_id, status, usage_log_id, _now()),
        )
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, captcha_id, operator_id, 0, 10, 20, _now()),
        )

    create_usage_finance_entries(conn, usage_log_id, 1000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id, distribution_answer_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    failed_answer = conn.execute(
        "SELECT id FROM distribution_answers WHERE usage_log_id = ? AND captcha_id = 'captcha-failed'",
        (usage_log_id,),
    ).fetchone()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 1000, None),
        ("operator_salary", -75, operator_user_id),
    ]
    assert all(row["distribution_answer_id"] != failed_answer["id"] for row in rows)


def test_recalculate_removes_open_operator_salary_for_failed_captcha_answers(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import recalculate_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Recalc Passed Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, company_id) VALUES (?, ?, ?, ?)",
        ("operator-recalc-passed", _now(), 0, company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 75, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("recalc-passed-key", "Recalc passed", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-recalc-passed", _now(), _now(), company_id, "Recalc Passed Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    answer_ids = {}
    for captcha_id, status in (("captcha-ok", "passed"), ("captcha-failed", "failed")):
        conn.execute(
            "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
            (captcha_id, status, usage_log_id, _now()),
        )
        conn.execute(
            """
            INSERT INTO distribution_answers
                (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (1, usage_log_id, captcha_id, operator_id, 0, 10, 20, _now()),
        )
        answer_ids[captcha_id] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for captcha_id, answer_id in answer_ids.items():
        conn.execute(
            """
            INSERT INTO finance_entries
                (usage_log_id, distribution_answer_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, 'operator_salary', -75, 'open', 'system', ?, ?, ?)
            """,
            (usage_log_id, answer_id, operator_user_id, f"operator-answer:{answer_id}", _now(), _now()),
        )
    conn.commit()
    conn.close()

    recalculate_usage_finance_entries(usage_log_id)

    conn = get_connection()
    rows = conn.execute(
        """
        SELECT distribution_answer_id
        FROM finance_entries
        WHERE usage_log_id = ? AND kind = 'operator_salary'
        ORDER BY id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [row["distribution_answer_id"] for row in rows] == [answer_ids["captcha-ok"]]


def test_recalculate_removes_open_operator_salary_for_free_operator(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import recalculate_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Recalc Free Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Operator", "operator", 1, 0, _now()),
    )
    operator_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operators (uuid, created_at, icon_rate, billing_mode, company_id) VALUES (?, ?, ?, ?, ?)",
        ("operator-recalc-free", _now(), 120, "free", company_id),
    )
    operator_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO operator_profiles (user_id, company_id, operator_id, active, created_at) VALUES (?, ?, ?, 1, ?)",
        (operator_user_id, company_id, operator_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 1000, 500, 0, 60, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("recalc-free-key", "Recalc free", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
        """,
        (api_key_id, "res-recalc-free", _now(), _non_peak_time(), company_id, "Recalc Free Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO captchas (captcha_id, status, usage_log_id, created_at) VALUES (?, ?, ?, ?)",
        ("captcha-recalc-free", "passed", usage_log_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO distribution_answers
            (distribution_id, usage_log_id, captcha_id, operator_id, icon_position, x, y, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (1, usage_log_id, "captcha-recalc-free", operator_id, 0, 10, 20, _now()),
    )
    answer_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (usage_log_id, distribution_answer_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, 'operator_salary', -120, 'open', 'system', ?, ?, ?)
        """,
        (usage_log_id, answer_id, operator_user_id, f"operator-answer:{answer_id}", _now(), _now()),
    )
    conn.commit()
    conn.close()

    recalculate_usage_finance_entries(usage_log_id)

    conn = get_connection()
    rows = conn.execute(
        "SELECT kind, amount FROM finance_entries WHERE usage_log_id = ? ORDER BY kind, id",
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"]) for row in rows] == [("customer_income", 1000)]


def test_recalculate_usage_finance_entries_refreshes_price_from_usage_company_tariff(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import recalculate_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Key Company", _now()))
    key_company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Usage Company", _now()))
    usage_company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (key_company_id, 1000, 500, 0, 0, _now(), _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (usage_company_id, 3000, 10000, 0, 0, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("recalc-usage-company-key", "Recalc usage company", _now(), key_company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, config_json, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, ?, 0)
        """,
        (
            api_key_id,
            "res-recalc-usage-company",
            _now(),
            _non_peak_time(),
            '{"mode":"create"}',
            usage_company_id,
            "Usage Company",
        ),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (usage_log_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, 'customer_income', 1000, 'open', 'system', ?, ?, ?)
        """,
        (usage_log_id, f"usage:{usage_log_id}:income", _now(), _now()),
    )
    conn.commit()
    conn.close()

    rows = recalculate_usage_finance_entries(usage_log_id)

    conn = get_connection()
    usage = conn.execute("SELECT price FROM usage_log WHERE id = ?", (usage_log_id,)).fetchone()
    conn.close()

    assert usage["price"] == 3000
    assert [(row["kind"], row["amount"]) for row in rows] == [("customer_income", 3000)]


def test_recalculate_usage_finance_service_returns_updated_usage_log_price(isolated_api_db):
    from src.db.connection import get_connection
    from src.services.billing_service import recalculate_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Service Recalc Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 3000, 10000, 0, 0, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("service-recalc-key", "Service recalc", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, config_json, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, ?, 0)
        """,
        (
            api_key_id,
            "res-service-recalc",
            _now(),
            _non_peak_time(),
            '{"mode":"create"}',
            company_id,
            "Service Recalc Co",
        ),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, content = recalculate_usage_finance_entries(usage_log_id)

    assert status == 200
    assert content["usage_log"]["id"] == usage_log_id
    assert content["usage_log"]["price"] == 3000


def test_executor_salary_uses_api_key_owner_and_company_tariff(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import create_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Key Company", _now()))
    key_company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Usage Company", _now()))
    usage_company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, login, role, active, is_director, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("Iriha", "iriha", "manager", 1, 0, key_company_id, _now()),
    )
    executor_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO user_executor_companies (user_id, company_id, active, created_at) VALUES (?, ?, 1, ?)",
        (executor_user_id, key_company_id, _now()),
    )
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (usage_company_id, 3000, 10000, 500, 75, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, user_id, created_at, company_id) VALUES (?, ?, ?, ?, ?)",
        ("iriha-key", "Iriha", executor_user_id, _now(), key_company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 3000, ?, ?, 0)
        """,
        (api_key_id, "res-iriha", _now(), _now(), usage_company_id, "Usage Company"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    create_usage_finance_entries(conn, usage_log_id, 3000)
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE usage_log_id = ?
        ORDER BY kind, id
        """,
        (usage_log_id,),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("customer_income", 3000, None),
        ("executor_salary", -500, executor_user_id),
    ]


def test_finance_entry_list_includes_user_display_name(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import list_finance_entries

    conn = get_connection()
    conn.execute(
        "INSERT INTO users (name, login, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("Iriha", "iriha", "manager", 1, 0, _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, 'executor_salary', -500, 'open', 'test', 'test:user-name', ?, ?)
        """,
        (user_id, _now(), _now()),
    )
    conn.commit()
    conn.close()

    rows = list_finance_entries({"kind": "executor_salary"})

    assert rows[0]["user_id"] == user_id
    assert rows[0]["user_name"] == "Iriha"
    assert rows[0]["user_login"] == "iriha"


def test_recalculate_usage_finance_entries_includes_user_display_name(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.finance import recalculate_usage_finance_entries

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Recalc Names Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, login, role, active, is_director, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("Iriha", "iriha", "manager", 1, 0, company_id, _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_tariffs
            (company_id, price_create, price_reschedule, executor_amount, operator_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, 3000, 10000, 500, 75, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, user_id, created_at, company_id) VALUES (?, ?, ?, ?, ?)",
        ("recalc-name-key", "Iriha", user_id, _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 3000, ?, ?, 0)
        """,
        (api_key_id, "res-recalc-name", _now(), _now(), company_id, "Recalc Names Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    rows = recalculate_usage_finance_entries(usage_log_id)
    executor_row = next(row for row in rows if row["kind"] == "executor_salary")

    assert executor_row["user_id"] == user_id
    assert executor_row["user_name"] == "Iriha"
    assert executor_row["user_login"] == "iriha"


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
            commission_user_id=executor_user_id,
            tax_user_id=operator_user_id,
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


def test_paid_invoice_item_creates_income_lot_for_expense_repayment(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import create_payout_with_calculation, delete_payout, validate_expense_repayments_available_profit, preview_payout
    from src.models import CreateInvoiceBody
    from src.services.invoice_service import create_invoice, update_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Manual Line Co", _now()))
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, 'manager', 1, 0, ?)",
        ("Admin", _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO expenses (amount, reason, user_id, created_at)
        VALUES (40000, 'Manual project cost', ?, ?)
        """,
        (user_id, _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, invoice = create_invoice(
        CreateInvoiceBody(
            company="Manual Line Co",
            tax_rate=0,
            percent_rate=0,
            items=[{"description": "Development work", "amount": 40000}],
        )
    )
    assert status == 200
    invoice_id = invoice["id"]

    update_status, _ = update_invoice(invoice_id, SimpleNamespace(paid=True))
    assert update_status == 200

    ok, requested, available = validate_expense_repayments_available_profit(
        [invoice_id],
        [{"expense_id": expense_id, "amount": 40000}],
    )
    assert ok is True
    assert requested == 40000
    assert available == 40000

    preview = preview_payout(
        [invoice_id],
        [],
        [{"user_id": user_id, "split_pct": 100}],
        [{"expense_id": expense_id, "amount": 40000}],
    )

    assert preview["total_income"] == 40000
    assert preview["total_expenses"] == 40000
    assert preview["net_amount"] == 0

    payout = create_payout_with_calculation(
        "Manual line payout",
        [invoice_id],
        [],
        [{"user_id": user_id, "split_pct": 100}],
        [{"expense_id": expense_id, "amount": 40000}],
    )

    assert [(expense["expense_id"], expense["amount"]) for expense in payout["expenses"]] == [
        (expense_id, 40000)
    ]
    assert payout["total_expenses"] == 40000

    assert delete_payout(payout["id"]) is True

    conn = get_connection()
    deleted = conn.execute("SELECT 1 FROM payouts WHERE id = ?", (payout["id"],)).fetchone()
    lingering = conn.execute(
        "SELECT COUNT(*) AS cnt FROM finance_entries WHERE payout_id = ?",
        (payout["id"],),
    ).fetchone()
    repayment = conn.execute(
        "SELECT COUNT(*) AS cnt FROM finance_entries WHERE kind = 'expense_repayment' AND expense_id = ?",
        (expense_id,),
    ).fetchone()
    item = conn.execute(
        "SELECT id FROM invoice_items WHERE invoice_id = ?",
        (invoice_id,),
    ).fetchone()
    entry = conn.execute(
        """
        SELECT kind, amount, source, source_key, invoice_id
        FROM finance_entries
        WHERE invoice_id = ? AND source = 'invoice_item'
        """,
        (invoice_id,),
    ).fetchone()
    lot = conn.execute(
        "SELECT usage_log_id, invoice_id, gross_amount FROM profit_lots WHERE invoice_id = ?",
        (invoice_id,),
    ).fetchone()
    conn.close()

    assert deleted is None
    assert lingering["cnt"] == 0
    assert repayment["cnt"] == 0
    assert dict(entry) == {
        "kind": "customer_income",
        "amount": 40000,
        "source": "invoice_item",
        "source_key": f"invoice-item:{item['id']}:income",
        "invoice_id": invoice_id,
    }
    assert lot["usage_log_id"] is None
    assert lot["gross_amount"] == 40000


def test_added_invoice_records_positive_commission_and_tax_entries(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Added Mode Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    users = {}
    for name in ["Commission", "Tax"]:
        conn.execute(
            "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, 'manager', 1, 0, ?)",
            (name, _now()),
        )
        users[name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("added-mode-key", "Added", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, 'res-added-mode', 'confirmed', ?, ?, 2730, ?, 'Added Mode Co', 0)
        """,
        (api_key_id, _now(), _now(), company_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, usage_log_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 2730, 'open', 'test', ?, ?, ?)
        """,
        (company_id, usage_log_id, f"usage:{usage_log_id}:income", _now(), _now()),
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
            commission_user_id=users["Commission"],
            tax_user_id=users["Tax"],
        )
    )

    assert status == 200
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE invoice_id = ? AND kind IN ('invoice_commission', 'invoice_tax')
        ORDER BY kind
        """,
        (invoice["invoice_id"],),
    ).fetchall()
    conn.close()

    assert [(row["kind"], row["amount"], row["user_id"]) for row in rows] == [
        ("invoice_commission", 150, users["Commission"]),
        ("invoice_tax", 120, users["Tax"]),
    ]


def test_included_invoice_deducts_commission_and_tax_from_profit_lot(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Included Mode Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_billing_settings
            (company, auto_invoice_reopen, tax_commission_mode, updated_at)
        VALUES ('Included Mode Co', 0, 'included', ?)
        """,
        (_now(),),
    )
    users = {}
    for name in ["Commission", "Tax"]:
        conn.execute(
            "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, 'manager', 1, 0, ?)",
            (name, _now()),
        )
        users[name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("included-mode-key", "Included", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, 'res-included-mode', 'confirmed', ?, ?, 3000, ?, 'Included Mode Co', 0)
        """,
        (api_key_id, _now(), _now(), company_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for kind, amount, suffix in [
        ("customer_income", 3000, "income"),
        ("executor_salary", -200, "executor"),
        ("operator_salary", -100, "operator"),
    ]:
        conn.execute(
            """
            INSERT INTO finance_entries
                (company_id, usage_log_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'open', 'test', ?, ?, ?)
            """,
            (company_id, usage_log_id, kind, amount, f"usage:{usage_log_id}:{suffix}", _now(), _now()),
        )
    conn.commit()
    conn.close()

    status, invoice = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=[usage_log_id],
            percent_rate=5,
            tax_rate=6,
            debt_amount=3000,
            percent_amount=169,
            tax_amount=202,
            total_amount=3371,
            commission_user_id=users["Commission"],
            tax_user_id=users["Tax"],
        )
    )

    assert status == 200
    conn = get_connection()
    saved = conn.execute(
        """
        SELECT debt_amount, percent_amount, tax_amount, total_amount, tax_commission_mode
        FROM invoices
        WHERE id = ?
        """,
        (invoice["invoice_id"],),
    ).fetchone()
    entries = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE invoice_id = ? AND kind IN ('invoice_commission', 'invoice_tax')
        ORDER BY kind
        """,
        (invoice["invoice_id"],),
    ).fetchall()
    lot = conn.execute(
        "SELECT gross_amount FROM profit_lots WHERE usage_log_id = ? AND invoice_id = ?",
        (usage_log_id, invoice["invoice_id"]),
    ).fetchone()
    conn.close()

    assert dict(saved) == {
        "debt_amount": 3000,
        "percent_amount": 150,
        "tax_amount": 180,
        "total_amount": 3000,
        "tax_commission_mode": "included",
    }
    assert [(row["kind"], row["amount"], row["user_id"]) for row in entries] == [
        ("invoice_commission", -150, users["Commission"]),
        ("invoice_tax", -180, users["Tax"]),
    ]
    assert lot["gross_amount"] == 2370


def test_generated_invoice_uses_company_default_rates_and_recipients(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Default Billing Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    users = {}
    for name in ["Default Commission", "Default Tax"]:
        conn.execute(
            "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, 'manager', 1, 0, ?)",
            (name, _now()),
        )
        users[name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_billing_settings (
            company, auto_invoice_reopen, tax_commission_mode,
            default_percent_rate, default_tax_rate,
            default_commission_user_id, default_tax_user_id,
            updated_at
        )
        VALUES (?, 0, 'included', 5, 6, ?, ?, ?)
        """,
        ("Default Billing Co", users["Default Commission"], users["Default Tax"], _now()),
    )
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("default-billing-key", "Default billing", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, 'res-default-billing', 'confirmed', ?, ?, 3000, ?, 'Default Billing Co', 0)
        """,
        (api_key_id, _now(), _now(), company_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, invoice = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=[usage_log_id],
            debt_amount=3000,
        )
    )

    assert status == 200
    conn = get_connection()
    saved = conn.execute(
        """
        SELECT percent_rate, tax_rate, percent_amount, tax_amount, total_amount,
               commission_user_id, tax_user_id, tax_commission_mode
        FROM invoices
        WHERE id = ?
        """,
        (invoice["invoice_id"],),
    ).fetchone()
    entries = conn.execute(
        """
        SELECT kind, amount, user_id
        FROM finance_entries
        WHERE invoice_id = ? AND kind IN ('invoice_commission', 'invoice_tax')
        ORDER BY kind
        """,
        (invoice["invoice_id"],),
    ).fetchall()
    conn.close()

    assert dict(saved) == {
        "percent_rate": 5.0,
        "tax_rate": 6.0,
        "percent_amount": 150,
        "tax_amount": 180,
        "total_amount": 3000,
        "commission_user_id": users["Default Commission"],
        "tax_user_id": users["Default Tax"],
        "tax_commission_mode": "included",
    }
    assert [(row["kind"], row["amount"], row["user_id"]) for row in entries] == [
        ("invoice_commission", -150, users["Default Commission"]),
        ("invoice_tax", -180, users["Default Tax"]),
    ]


def test_closed_open_invoice_keeps_tax_commission_mode_snapshot(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.invoices import ensure_open_invoice, get_invoice, issue_open_invoice
    from src.repositories.company_billing_repo import upsert_company_billing_settings

    upsert_company_billing_settings("Snapshot Co", auto_invoice_reopen=False, tax_commission_mode="included")
    open_invoice = ensure_open_invoice("Snapshot Co")

    upsert_company_billing_settings("Snapshot Co", auto_invoice_reopen=False, tax_commission_mode="added")
    issued = issue_open_invoice("Snapshot Co")
    upsert_company_billing_settings("Snapshot Co", auto_invoice_reopen=False, tax_commission_mode="included")
    closed_again = get_invoice(issued["closed_invoice"]["id"])

    assert open_invoice["tax_commission_mode"] == "included"
    assert issued["closed_invoice"]["tax_commission_mode"] == "added"
    assert closed_again["tax_commission_mode"] == "added"

    conn = get_connection()
    stored = conn.execute(
        "SELECT tax_commission_mode FROM invoices WHERE id = ?",
        (issued["closed_invoice"]["id"],),
    ).fetchone()
    conn.close()
    assert stored["tax_commission_mode"] == "added"


def test_generated_invoice_saves_commission_and_tax_recipients(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Invoice Recipients Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("invoice-rec-key", "Invoice Rec", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 3000, ?, ?, 0)
        """,
        (api_key_id, "res-invoice-rec", _now(), _now(), company_id, "Invoice Recipients Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Commission User", "manager", 1, 0, _now()),
    )
    commission_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Tax User", "manager", 1, 0, _now()),
    )
    tax_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, invoice = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=[usage_log_id],
            percent_rate=5,
            tax_rate=6,
            debt_amount=3000,
            percent_amount=169,
            tax_amount=202,
            total_amount=3371,
            commission_user_id=commission_user_id,
            tax_user_id=tax_user_id,
        )
    )

    assert status == 200
    conn = get_connection()
    saved = conn.execute(
        "SELECT commission_user_id, tax_user_id FROM invoices WHERE id = ?",
        (invoice["invoice_id"],),
    ).fetchone()
    conn.close()

    assert saved["commission_user_id"] == commission_user_id
    assert saved["tax_user_id"] == tax_user_id


def test_generated_invoice_requires_recipients_for_commission_and_tax(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Invoice Required Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("invoice-req-key", "Invoice Req", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO usage_log
            (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
        VALUES (?, ?, 'confirmed', ?, ?, 3000, ?, ?, 0)
        """,
        (api_key_id, "res-invoice-req", _now(), _now(), company_id, "Invoice Required Co"),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, body = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=[usage_log_id],
            percent_rate=5,
            tax_rate=6,
            debt_amount=3000,
            percent_amount=169,
            tax_amount=202,
            total_amount=3371,
        )
    )

    assert status == 400
    assert "commission_user_id" in body["error"]
    assert "tax_user_id" in body["error"]


def test_generated_invoice_rejects_usage_logs_from_different_companies(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import GenerateInvoiceBody
    from src.services.invoice_service import generate_invoice

    conn = get_connection()
    usage_log_ids = []
    for company_name in ["Mixed Invoice A", "Mixed Invoice B"]:
        conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", (company_name, _now()))
        company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
            (f"{company_name}-key", company_name, _now(), company_id),
        )
        api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            """
            INSERT INTO usage_log
                (api_key_id, reservation_id, status, created_at, confirmed_at, price, company_id, company, is_test)
            VALUES (?, ?, 'confirmed', ?, ?, 1000, ?, ?, 0)
            """,
            (api_key_id, f"res-{company_id}", _now(), _now(), company_id, company_name),
        )
        usage_log_ids.append(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES ('Commission', 'manager', 1, 0, ?)",
        (_now(),),
    )
    commission_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES ('Tax', 'manager', 1, 0, ?)",
        (_now(),),
    )
    tax_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, body = generate_invoice(
        GenerateInvoiceBody(
            usage_log_ids=usage_log_ids,
            percent_rate=5,
            tax_rate=6,
            debt_amount=2000,
            percent_amount=112,
            tax_amount=135,
            total_amount=2247,
            commission_user_id=commission_user_id,
            tax_user_id=tax_user_id,
        )
    )

    assert status == 400
    assert "same company" in body["error"]


def test_manual_invoice_uses_company_tax_commission_mode(isolated_api_db):
    from src.db.connection import get_connection
    from src.models import CreateInvoiceBody
    from src.services.invoice_service import create_invoice

    conn = get_connection()
    conn.execute(
        """
        INSERT INTO company_billing_settings
            (company, auto_invoice_reopen, tax_commission_mode, updated_at)
        VALUES ('Manual Included Co', 0, 'included', ?)
        """,
        (_now(),),
    )
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES ('Commission', 'manager', 1, 0, ?)",
        (_now(),),
    )
    commission_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES ('Tax', 'manager', 1, 0, ?)",
        (_now(),),
    )
    tax_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, invoice = create_invoice(
        CreateInvoiceBody(
            company="Manual Included Co",
            percent_rate=5,
            tax_rate=6,
            debt_amount=3000,
            total_amount=3000,
            items=[{"description": "Manual work", "amount": 3000}],
            commission_user_id=commission_user_id,
            tax_user_id=tax_user_id,
        )
    )

    assert status == 200
    assert invoice["company"] == "Manual Included Co"
    assert invoice["tax_commission_mode"] == "included"
    assert invoice["debt_amount"] == 3000
    assert invoice["percent_amount"] == 150
    assert invoice["tax_amount"] == 180
    assert invoice["total_amount"] == 3000


def test_expense_repayment_uses_profit_lot_without_remaining_mutation(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.expenses import list_expenses
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
    expense = next(row for row in list_expenses() if row["id"] == expense_id)
    assert expense["allocation"]["allocated_amount"] == 1000.0
    assert expense["allocation"]["allocated_pct"] == 6.7
    assert expense["allocation"]["status"] == "partially_allocated"


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


def test_payout_ledger_without_profit_lots_falls_back_to_invoice_net(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import preview_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Payout Preview Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Configured Split", "manager", _now()),
    )
    split_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-PREVIEW-NO-LOTS", "Payout Preview Co", 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 1000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, invoice_id, f"invoice:{invoice_id}:income", _now(), _now()),
    )
    conn.commit()
    conn.close()

    result = preview_payout(
        [invoice_id],
        [],
        [{"user_id": split_user_id, "split_pct": 100}],
    )

    assert result["net_amount"] == 1000.0
    assert result["shares"][0]["profit_share"] == 1000.0
    assert result["shares"][0]["user_name"] == "Configured Split"


def test_payout_preview_reports_already_allocated_profit(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import preview_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Allocated Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-ALLOCATED", "Allocated Co", 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("allocated-key", "Allocated", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-allocated", _now(), _now(), company_id, "Allocated Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 1000, _now(), _now()),
    )
    profit_lot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, profit_lot_id, user_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'director_profit', -600, 'locked', 'test', ?, ?, ?)
        """,
        (company_id, invoice_id, profit_lot_id, user_id, f"director-profit:{invoice_id}", _now(), _now()),
    )
    conn.commit()
    conn.close()

    result = preview_payout(
        [invoice_id],
        [],
        [{"user_id": user_id, "split_pct": 100}],
    )

    assert result["total_income"] == 1000.0
    assert result["already_allocated"] == 600.0
    assert result["net_amount"] == 400.0
    assert result["shares"][0]["profit_share"] == 400.0


def test_payout_preview_mixes_profit_lots_with_legacy_invoices(isolated_api_db):
    from src.db.connection import get_connection
    from src.db.payouts import preview_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Mixed Lots Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-LEGACY", "Mixed Lots Co", 3000, 0, 0, 3000, _now()),
    )
    legacy_invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 3000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, legacy_invoice_id, f"legacy:{legacy_invoice_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-LOT", "Mixed Lots Co", 1000, 0, 0, 1000, _now()),
    )
    lot_invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("mixed-lots-key", "Mixed Lots", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-mixed-lots", _now(), _now(), company_id, "Mixed Lots Co", lot_invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, lot_invoice_id, 1000, _now(), _now()),
    )
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 1000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, lot_invoice_id, f"lot:{lot_invoice_id}:income", _now(), _now()),
    )
    conn.commit()
    conn.close()

    result = preview_payout(
        [legacy_invoice_id, lot_invoice_id],
        [],
        [{"user_id": user_id, "split_pct": 100}],
    )

    assert result["total_income"] == 4000.0
    assert result["net_amount"] == 4000.0
    assert result["shares"][0]["profit_share"] == 4000.0


def test_payout_preview_allows_empty_splits_and_shows_repayment_overflow(isolated_api_db):
    from types import SimpleNamespace

    from src.db.connection import get_connection
    from src.db.payouts import preview_payout
    from src.services.payout_service import create_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Partial Expense Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Expense Owner", "manager", _now()),
    )
    expense_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Split Owner", "manager", _now()),
    )
    split_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-PARTIAL-OVERFLOW", "Partial Expense Co", 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 1000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, invoice_id, f"invoice:{invoice_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
        (expense_user_id, 1500, "Partial server", _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    preview = preview_payout([invoice_id], [], [], [{"expense_id": expense_id, "amount": 1500}])

    assert preview["net_amount"] == -500.0
    assert preview["total_expenses"] == 1500.0
    assert preview["shares"][0]["user_id"] == expense_user_id
    assert preview["shares"][0]["expenses_compensation"] == 1500.0

    status, payload = create_payout(
        SimpleNamespace(
            name="Overflow payout",
            invoice_ids=[invoice_id],
            expense_ids=[],
            expense_repayments=[{"expense_id": expense_id, "amount": 1500}],
            user_splits=[{"user_id": split_user_id, "split_pct": 100}],
        ),
    )

    assert status == 400
    assert "превышает net" in payload["error"]


def test_expense_repayment_reduces_profit_shares_without_increasing_total(isolated_api_db):
    from types import SimpleNamespace

    from src.db.connection import get_connection
    from src.db.payouts import preview_payout
    from src.services.payout_service import create_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Repayment Balance Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director A", "manager", _now()),
    )
    director_a_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director B", "manager", _now()),
    )
    director_b_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Expense Owner", "manager", _now()),
    )
    expense_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-REPAYMENT-BALANCE", "Repayment Balance Co", 4000, 0, 0, 4000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("repayment-balance-key", "Repayment Balance", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-repayment-balance", _now(), _now(), company_id, "Repayment Balance Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 4000, _now(), _now()),
    )
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 4000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, invoice_id, f"repayment-balance:{invoice_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
        (expense_user_id, 1000, "Repayment balance expense", _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    splits = [
        {"user_id": director_a_id, "split_pct": 50},
        {"user_id": director_b_id, "split_pct": 50},
    ]
    repayments = [{"expense_id": expense_id, "amount": 1000}]
    preview = preview_payout([invoice_id], [], splits, repayments)
    preview_total = sum(float(share["total"] or 0) for share in preview["shares"])
    shares_by_user = {share["user_id"]: share for share in preview["shares"]}

    assert preview["net_amount"] == 3000.0
    assert shares_by_user[director_a_id]["profit_share"] == 1500.0
    assert shares_by_user[director_b_id]["profit_share"] == 1500.0
    assert shares_by_user[expense_user_id]["expenses_compensation"] == 1000.0
    assert preview_total == 4000.0

    status, payout = create_payout(
        SimpleNamespace(
            name="Repayment balance payout",
            invoice_ids=[invoice_id],
            expense_ids=[],
            expense_repayments=repayments,
            user_splits=splits,
        ),
    )
    assert status == 200
    payout_shares_by_user = {share["user_id"]: share for share in payout["shares"]}
    payout_total = sum(float(share["total"] or 0) for share in payout["shares"])

    assert payout_shares_by_user[director_a_id]["profit_share"] == 1500.0
    assert payout_shares_by_user[director_b_id]["profit_share"] == 1500.0
    assert payout_shares_by_user[expense_user_id]["expenses_compensation"] == 1000.0
    assert payout_total == 4000.0


def test_create_payout_rebuilds_legacy_profit_lots_for_repayments(isolated_api_db):
    from types import SimpleNamespace

    from src.db.connection import get_connection
    from src.services.payout_service import create_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Legacy Repay Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Expense Owner", "manager", _now()),
    )
    expense_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-LEGACY-REPAY", "Legacy Repay Co", 4000, 0, 0, 4000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("legacy-repay-key", "Legacy Repay", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-legacy-repay", _now(), _now(), company_id, "Legacy Repay Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO finance_entries
            (company_id, invoice_id, kind, amount, edit_state, source, source_key, created_at, updated_at)
        VALUES (?, ?, 'customer_income', 4000, 'open', 'test', ?, ?, ?)
        """,
        (company_id, invoice_id, f"usage:{usage_log_id}:income", _now(), _now()),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
        (expense_user_id, 1000, "Legacy repayment expense", _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, payout = create_payout(
        SimpleNamespace(
            name="Legacy repayment payout",
            invoice_ids=[invoice_id],
            expense_ids=[],
            expense_repayments=[{"expense_id": expense_id, "amount": 1000}],
            user_splits=[{"user_id": director_id, "split_pct": 100}],
        ),
    )

    assert status == 200
    shares_by_user = {share["user_id"]: share for share in payout["shares"]}
    assert shares_by_user[director_id]["profit_share"] == 3000.0
    assert shares_by_user[expense_user_id]["expenses_compensation"] == 1000.0

    conn = get_connection()
    lot = conn.execute("SELECT * FROM profit_lots WHERE invoice_id = ?", (invoice_id,)).fetchone()
    conn.close()
    assert lot is not None


def test_create_payout_rejects_unpaid_invoice_for_repayment(isolated_api_db):
    from types import SimpleNamespace

    from src.db.connection import get_connection
    from src.services.payout_service import create_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Unpaid Lot Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Expense Owner", "manager", _now()),
    )
    expense_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
        ("INV-UNPAID-LOT", "Unpaid Lot Co", 1000, 0, 0, 1000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("unpaid-lot-key", "Unpaid Lot", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-unpaid-lot", _now(), _now(), company_id, "Unpaid Lot Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 1000, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
        (expense_user_id, 400, "Unpaid lot repayment", _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, payload = create_payout(
        SimpleNamespace(
            name="Unpaid lot repayment payout",
            invoice_ids=[invoice_id],
            expense_ids=[],
            expense_repayments=[{"expense_id": expense_id, "amount": 400}],
            user_splits=[{"user_id": director_id, "split_pct": 100}],
        ),
    )

    assert status == 400
    assert "только оплаченные счета" in payload["error"]


def test_create_payout_rejects_repayment_above_available_paid_lots(isolated_api_db):
    from types import SimpleNamespace

    from src.db.connection import get_connection
    from src.services.payout_service import create_payout

    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES (?, ?)", ("Available Lots Co", _now()))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 1, ?)",
        ("Director", "manager", _now()),
    )
    director_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO users (name, role, active, is_director, created_at) VALUES (?, ?, 1, 0, ?)",
        ("Expense Owner", "manager", _now()),
    )
    expense_user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO invoices (invoice_number, company, paid, debt_amount, percent_amount, tax_amount, total_amount, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)",
        ("INV-AVAILABLE-LOTS", "Available Lots Co", 5000, 0, 0, 5000, _now()),
    )
    invoice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO api_keys (key, label, created_at, company_id) VALUES (?, ?, ?, ?)",
        ("available-lots-key", "Available Lots", _now(), company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO usage_log (api_key_id, reservation_id, status, created_at, confirmed_at, company_id, company, invoice_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?)",
        (api_key_id, "res-available-lots", _now(), _now(), company_id, "Available Lots Co", invoice_id),
    )
    usage_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO profit_lots (company_id, usage_log_id, invoice_id, gross_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, usage_log_id, invoice_id, 1000, _now(), _now()),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, amount, reason, created_at) VALUES (?, ?, ?, ?)",
        (expense_user_id, 2000, "Too large repayment", _now()),
    )
    expense_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    status, payload = create_payout(
        SimpleNamespace(
            name="Too large repayment payout",
            invoice_ids=[invoice_id],
            expense_ids=[],
            expense_repayments=[{"expense_id": expense_id, "amount": 2000}],
            user_splits=[{"user_id": director_id, "split_pct": 100}],
        ),
    )

    assert status == 400
    assert "доступную прибыль" in payload["error"]


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
