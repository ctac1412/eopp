"""Regression tests for environment-provisioned technical login users."""


def test_create_app_ensures_env_tech_user_login(isolated_api_db, monkeypatch):
    from fastapi.testclient import TestClient

    from src.app import create_app
    from src.repositories import user_repo

    monkeypatch.setenv("EOPP_TECH_USER_LOGIN", "codex")
    monkeypatch.setenv("EOPP_TECH_USER_PASSWORD", "codex-password")
    monkeypatch.setenv("EOPP_TECH_USER_ROLE", "super_admin")

    app = create_app()
    client = TestClient(app)

    login = client.post("/api/auth/login", json={"login": "codex", "password": "codex-password"})

    assert login.status_code == 200
    assert login.json()["role"] == "super_admin"
    assert "eopp_session" in login.cookies

    users = [user for user in user_repo.list_users() if user["login"] == "codex"]
    assert len(users) == 1
    assert users[0]["name"] == "Technical Test User"


def test_create_app_updates_existing_env_tech_user_password(isolated_api_db, monkeypatch):
    from fastapi.testclient import TestClient

    from src.app import create_app
    from src.repositories import user_repo

    user_repo.create_user(
        name="Old Codex",
        login="codex",
        password="old-password",
        role="manager",
        active=False,
    )
    monkeypatch.setenv("EOPP_TECH_USER_LOGIN", "codex")
    monkeypatch.setenv("EOPP_TECH_USER_PASSWORD", "new-password")
    monkeypatch.setenv("EOPP_TECH_USER_NAME", "Codex Local Admin")
    monkeypatch.setenv("EOPP_TECH_USER_ROLE", "administrator")

    app = create_app()
    client = TestClient(app)

    old_login = client.post("/api/auth/login", json={"login": "codex", "password": "old-password"})
    new_login = client.post("/api/auth/login", json={"login": "codex", "password": "new-password"})

    assert old_login.status_code == 401
    assert new_login.status_code == 200
    assert new_login.json()["role"] == "administrator"
    users = [user for user in user_repo.list_users() if user["login"] == "codex"]
    assert len(users) == 1
    assert users[0]["active"] is True
    assert users[0]["name"] == "Codex Local Admin"
