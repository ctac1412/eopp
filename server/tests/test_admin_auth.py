def test_admin_route_requires_token(client):
    response = client.get("/admin/streams")

    assert response.status_code == 401


def test_admin_auth_accepts_admin_key(client, admin_token):
    response = client.post("/admin/auth", json={"token": admin_token})

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["role"] in ("super_admin", "manager")
