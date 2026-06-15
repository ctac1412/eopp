"""Default company tariff behavior."""

from src.repositories import company_repo
from src.repositories import company_billing_repo


DEFAULT_TARIFF = {
    "price_create": 1100,
    "price_reschedule": 2200,
    "price_create_peak": 3300,
    "price_custom_slots": 4400,
    "executor_amount": 550,
    "operator_amount": 660,
}

DEFAULT_BILLING = {
    "tax_commission_mode": "included",
    "default_percent_rate": 5,
    "default_tax_rate": 6,
    "default_commission_user_id": 101,
    "default_tax_user_id": 102,
}


def _put_default_tariff(client, admin_token, payload=None):
    return client.put(
        "/admin/default-company-tariff",
        headers={"X-Admin-Token": admin_token},
        json=payload or DEFAULT_TARIFF,
    )


def test_manual_company_creation_copies_default_tariff(client, admin_token):
    default_response = _put_default_tariff(client, admin_token)
    assert default_response.status_code == 200

    create_response = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Manual Default Tariff LLC"},
    )

    assert create_response.status_code == 201
    company = create_response.json()
    assert company["tariff"] == {
        **DEFAULT_TARIFF,
        "source": "company",
        "company_id": company["id"],
    }


def test_auto_company_creation_copies_default_tariff(client, admin_token):
    default_response = _put_default_tariff(client, admin_token)
    assert default_response.status_code == 200

    company = company_repo.get_or_create_company("Auto Default Tariff LLC")
    rows = company_repo.list_companies(company.id)

    assert rows[0]["tariff"] == {
        **DEFAULT_TARIFF,
        "source": "company",
        "company_id": company.id,
    }


def test_effective_tariff_ignores_legacy_api_key_tariff(isolated_api_db):
    from datetime import UTC, datetime

    from src.db.connection import get_connection
    from src.db.tariffs import get_effective_tariff

    now = datetime.now(UTC).isoformat()
    conn = get_connection()
    conn.execute("INSERT INTO companies (name, created_at) VALUES ('Key Tariff Legacy Co', ?)", (now,))
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO api_keys (key, label, created_at, company_id)
        VALUES ('legacy-key-tariff', 'Legacy key tariff', ?, ?)
        """,
        (now, company_id),
    )
    api_key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO company_tariffs (
            company_id, price_create, price_reschedule, price_create_peak,
            price_custom_slots, executor_amount, operator_amount, created_at, updated_at
        )
        VALUES (?, 1100, 2200, 3300, 4400, 0, 0, ?, ?)
        """,
        (company_id, now, now),
    )
    conn.execute(
        """
        INSERT INTO tariffs (
            api_key_id, price_create, price_reschedule, price_create_peak,
            price_custom_slots, created_at, updated_at
        )
        VALUES (?, 1, 2, 3, 4, ?, ?)
        """,
        (api_key_id, now, now),
    )
    conn.commit()
    conn.close()

    tariff = get_effective_tariff(api_key_id)

    assert tariff["price_create"] == 1100
    assert tariff["price_reschedule"] == 2200
    assert tariff["price_create_peak"] == 3300
    assert tariff["price_custom_slots"] == 4400


def test_manual_company_creation_copies_default_billing_settings(client, admin_token):
    default_response = _put_default_tariff(
        client,
        admin_token,
        {**DEFAULT_TARIFF, **DEFAULT_BILLING},
    )
    assert default_response.status_code == 200
    assert default_response.json() == {
        **DEFAULT_TARIFF,
        **DEFAULT_BILLING,
        "source": "default",
    }

    create_response = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Manual Default Billing LLC"},
    )

    assert create_response.status_code == 201
    settings = company_billing_repo.get_company_billing_settings("Manual Default Billing LLC")
    assert settings.tax_commission_mode == "included"
    assert settings.default_percent_rate == 5
    assert settings.default_tax_rate == 6
    assert settings.default_commission_user_id == 101
    assert settings.default_tax_user_id == 102


def test_apply_default_tariff_overwrites_existing_company_tariff(client, admin_token):
    default_response = _put_default_tariff(client, admin_token)
    assert default_response.status_code == 200
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Overwrite Default Tariff LLC"},
    ).json()
    client.put(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
        json={
            "price_create": 1,
            "price_reschedule": 2,
            "price_create_peak": None,
            "price_custom_slots": None,
            "executor_amount": 3,
            "operator_amount": 4,
        },
    )

    apply_response = client.post(
        f"/admin/company-tariffs/{company['id']}/apply-default",
        headers={"X-Admin-Token": admin_token},
    )

    assert apply_response.status_code == 200
    assert apply_response.json() == {
        **DEFAULT_TARIFF,
        "source": "company",
        "company_id": company["id"],
    }
