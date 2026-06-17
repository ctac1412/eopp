from fastapi.testclient import TestClient


def test_admin_tab_html_navigation_serves_spa(monkeypatch, tmp_path, isolated_api_db):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><div id='root'></div>", encoding="utf-8")

    import src.routes.admin as admin_routes

    monkeypatch.setattr(admin_routes, "FRONTEND_DIST", str(dist))

    from src.app import create_app

    client = TestClient(create_app())
    response = client.get("/admin/operators", headers={"Accept": "text/html"})

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<div id='root'></div>" in response.text


def test_admin_operator_api_without_session_still_returns_json_401(client):
    response = client.get("/api/admin/operators")

    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}
