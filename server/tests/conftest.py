import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db_template import cleanup_db_file, use_isolated_migrated_db  # noqa: E402

# Admin token is now required at import time — set default for tests
os.environ.setdefault("ADMIN_TOKEN", "test_admin_token_123")

# Windows: system Temp dir may be locked by antivirus. Use project-local dir.
if os.name == "nt" and "PYTEST_DEBUG_TEMPROOT" not in os.environ:
    _tmp_root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".pytest-tmp")
    os.makedirs(_tmp_root, exist_ok=True)
    os.environ["PYTEST_DEBUG_TEMPROOT"] = _tmp_root


@pytest.fixture
def isolated_api_db(monkeypatch):
    test_db = use_isolated_migrated_db(monkeypatch)

    yield

    cleanup_db_file(test_db)


@pytest.fixture
def client(isolated_api_db):
    from src.app import create_app

    app = create_app()
    return TestClient(app)


@pytest.fixture
def legacy_admin_api_key(isolated_api_db):
    from src.db import list_keys

    admin_key = next((key for key in list_keys() if key["is_admin"]), None)
    assert admin_key is not None
    return admin_key["key"]


@pytest.fixture
def admin_token(client, legacy_admin_api_key):
    response = client.post(
        "/api/auth/login",
        json={"login": "admin", "password": legacy_admin_api_key},
    )
    assert response.status_code == 200
    assert "eopp_session" in response.cookies
    return response.cookies["eopp_session"]


@pytest.fixture
def api_key(client, admin_token):
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Pytest Key Owner", "login": "pytest.key.owner", "password": "strong-password"},
    )
    assert user.status_code == 200
    response = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000, "user_id": user.json()["id"]},
    )
    assert response.status_code == 200
    login = client.post(
        "/api/auth/login",
        json={"login": "pytest.key.owner", "password": "strong-password"},
    )
    assert login.status_code == 200
    return response.json()["key"]


@pytest.fixture
def active_sse(api_key):
    """Register an active SSE stream for routes that require a live operator page."""
    from src.repositories import api_key_repo
    from src.sse.manager import register_sse_connection, unregister_sse_connection

    record = api_key_repo.get_key_record(api_key)
    api_key_id = record.id
    queue, _ = register_sse_connection(api_key_id, "testclient")

    yield

    unregister_sse_connection(queue, api_key_id)
