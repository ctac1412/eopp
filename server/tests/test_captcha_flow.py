def test_solve_captcha_invalid_key(client):
    response = client.post(
        "/api/solve-captcha",
        json={
            "api_key": "invalid",
            "auto_solve": True,
            "puzzle": {"tiles": [], "variantsCapture": []},
        },
    )

    assert response.status_code == 403


def test_broadcast_requires_admin(client):
    response = client.post("/api/broadcast", json={"type": "test"})

    assert response.status_code == 401
