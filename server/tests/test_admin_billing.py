def test_admin_company_tariff_crud(client, admin_token):
    company = client.post(
        "/api/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Admin Billing Tariff Co"},
    ).json()

    create = client.put(
        f"/api/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"price_create": 100, "price_reschedule": 50},
    )
    assert create.status_code == 200
    assert create.json()["price_create"] == 100

    get = client.get(
        f"/api/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert get.status_code == 200

    delete = client.delete(
        f"/api/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert delete.status_code == 200


def test_admin_default_payout_splits_crud(client, admin_token):
    first_user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Default Payout One", "login": "default.payout.one", "role": "manager"},
    ).json()
    second_user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Default Payout Two", "login": "default.payout.two", "role": "manager"},
    ).json()

    saved = client.put(
        "/api/admin/default-payout-splits",
        headers={"X-Admin-Token": admin_token},
        json={
            "splits": [
                {"user_id": second_user["id"], "split_pct": 35},
                {"user_id": first_user["id"], "split_pct": 65},
            ]
        },
    )

    assert saved.status_code == 200
    assert saved.json()["splits"] == [
        {"user_id": second_user["id"], "split_pct": 35.0},
        {"user_id": first_user["id"], "split_pct": 65.0},
    ]

    loaded = client.get(
        "/api/admin/default-payout-splits",
        headers={"X-Admin-Token": admin_token},
    )
    assert loaded.status_code == 200
    assert loaded.json()["splits"] == saved.json()["splits"]


def test_admin_expenses_empty_list(client, admin_token):
    response = client.get("/api/admin/expenses", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    assert response.json() == {"expenses": [], "total": 0}
