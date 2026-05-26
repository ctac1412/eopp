import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def isolated_api_db(monkeypatch):
    import src.db.connection as conn_module
    import src.db.init as init_module
    from src.entities.base import set_db_path

    test_db = tempfile.mktemp(suffix=".db")
    monkeypatch.setattr(conn_module, "DB_PATH", test_db)
    set_db_path(test_db)
    init_module.init_db()

    yield

    try:
        conn_module.get_connection().close()
    except Exception:
        pass
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except Exception:
            pass


@pytest.fixture
def client(isolated_api_db):
    from src.app import create_app

    app = create_app()
    return TestClient(app)


@pytest.fixture
def admin_token():
    from src.db import list_keys

    admin_key = next((key for key in list_keys() if key["is_admin"]), None)
    assert admin_key is not None
    return admin_key["key"]


@pytest.fixture
def api_key(client, admin_token):
    response = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000},
    )
    return response.json()["key"]
