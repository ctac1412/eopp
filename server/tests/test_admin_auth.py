def test_admin_route_requires_token(client):
    response = client.get("/api/admin/streams")

    assert response.status_code == 401


def test_admin_auth_accepts_password_login(client, legacy_admin_api_key):
    response = client.post("/api/auth/login", json={"login": "admin", "password": legacy_admin_api_key})

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["role"] == "super_admin"
    assert "finance" in data["sections"]
    assert "token" not in data


def test_admin_auth_rejects_legacy_token_login(client, legacy_admin_api_key):
    response = client.post("/api/auth/login", json={"token": legacy_admin_api_key})

    assert response.status_code == 401
