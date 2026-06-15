"""Default company tariff behavior."""

from src.repositories import company_repo


DEFAULT_TARIFF = {
    "price_create": 1100,
    "price_reschedule": 2200,
    "price_create_peak": 3300,
    "price_custom_slots": 4400,
    "executor_amount": 550,
    "operator_amount": 660,
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
