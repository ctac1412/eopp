def test_admin_company_tariff_crud(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Admin Billing Tariff Co"},
    ).json()

    create = client.put(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"price_create": 100, "price_reschedule": 50},
    )
    assert create.status_code == 200
    assert create.json()["price_create"] == 100

    get = client.get(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert get.status_code == 200

    delete = client.delete(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert delete.status_code == 200


def test_admin_expenses_empty_list(client, admin_token):
    response = client.get("/admin/expenses", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    assert response.json() == {"expenses": [], "total": 0}
