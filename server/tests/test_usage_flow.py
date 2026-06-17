def test_usage_log_invalid_key(client):
    response = client.get("/api/usage-log", params={"api_key": "invalid"})

    assert response.status_code == 403


def test_usage_log_admin_scope(client, admin_token):
    response = client.get("/api/usage-log", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    assert isinstance(response.json(), list)
