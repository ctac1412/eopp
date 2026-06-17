from fastapi.testclient import TestClient


def test_api_auth_login_sets_shared_cookie_and_admin_auth_alias_is_gone(
    client, legacy_admin_api_key
):
    login = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": legacy_admin_api_key},
    )

    assert login.status_code == 200
    assert login.cookies.get("eopp_session")

    assert client.post(
        "/admin/auth",
        json={"login": "admin", "password": legacy_admin_api_key},
    ).status_code in {404, 405}


def test_admin_browser_route_serves_spa_but_api_admin_route_returns_json(
    monkeypatch, tmp_path, isolated_api_db, legacy_admin_api_key
):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><div id='root'></div>", encoding="utf-8")

    import src.routes.admin as admin_routes

    monkeypatch.setattr(admin_routes, "FRONTEND_DIST", str(dist))

    from src.app import create_app

    client = TestClient(create_app())
    login = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": legacy_admin_api_key},
    )
    assert login.status_code == 200

    html = client.get("/admin/invoices", headers={"Accept": "text/html"})
    assert html.status_code == 200
    assert "text/html" in html.headers["content-type"]
    assert "<div id='root'></div>" in html.text

    api = client.get("/api/admin/invoices")
    assert api.status_code == 200
    assert "application/json" in api.headers["content-type"]


def test_unknown_api_route_does_not_return_spa_html(monkeypatch, tmp_path, isolated_api_db):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><div id='root'></div>", encoding="utf-8")

    import src.routes.frontend as frontend_routes

    monkeypatch.setattr(frontend_routes, "FRONTEND_DIST", str(dist))

    from src.app import create_app

    client = TestClient(create_app())
    response = client.get("/api/not-real", headers={"Accept": "text/html"})

    assert response.status_code == 404
    assert "text/html" not in response.headers.get("content-type", "")
    assert "<div id='root'></div>" not in response.text
