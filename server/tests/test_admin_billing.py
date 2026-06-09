def test_admin_tariff_crud(client, admin_token, api_key):
    keys = client.get("/api-keys", headers={"X-Admin-Token": admin_token}).json()
    api_key_id = next(key["id"] for key in keys if key["label"] == "pytest_key")

    create = client.put(
        f"/admin/tariffs/{api_key_id}",
        headers={"X-Admin-Token": admin_token},
        json={"price_create": 100, "price_reschedule": 50},
    )
    assert create.status_code == 200
    assert create.json()["price_create"] == 100

    get = client.get(f"/admin/tariffs/{api_key_id}", headers={"X-Admin-Token": admin_token})
    assert get.status_code == 200

    delete = client.delete(f"/admin/tariffs/{api_key_id}", headers={"X-Admin-Token": admin_token})
    assert delete.status_code == 200


def test_admin_expenses_empty_list(client, admin_token):
    response = client.get("/admin/expenses", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    assert response.json() == {"expenses": [], "total": 0}
