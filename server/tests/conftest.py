import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Admin token is now required at import time — set default for tests
os.environ.setdefault("ADMIN_TOKEN", "test_admin_token_123")

# Windows: system Temp dir may be locked by antivirus. Use project-local dir.
if os.name == "nt" and "PYTEST_DEBUG_TEMPROOT" not in os.environ:
    _tmp_root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".pytest-tmp")
    os.makedirs(_tmp_root, exist_ok=True)
    os.environ["PYTEST_DEBUG_TEMPROOT"] = _tmp_root


@pytest.fixture
def isolated_api_db(monkeypatch):
    import src.db.connection as conn_module
    import src.db.init as init_module
    from src.entities.base import set_db_path

    test_db = tempfile.mkstemp(suffix=".db")[1]
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
def legacy_admin_api_key(isolated_api_db):
    from src.db import list_keys

    admin_key = next((key for key in list_keys() if key["is_admin"]), None)
    assert admin_key is not None
    return admin_key["key"]


@pytest.fixture
def admin_token(client, legacy_admin_api_key):
    response = client.post(
        "/admin/auth",
        json={"login": "admin", "password": legacy_admin_api_key},
    )
    assert response.status_code == 200
    assert "eopp_admin_session" in response.cookies
    return response.cookies["eopp_admin_session"]


@pytest.fixture
def api_key(client, admin_token):
    response = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "pytest_key", "max_uses": 1000},
    )
    return response.json()["key"]


@pytest.fixture
def active_sse(api_key):
    """Populate sse_queues so /register-usage passes the active-stream check."""
    from src.repositories import api_key_repo
    from src.sse.manager import lock, sse_queues

    record = api_key_repo.get_key_record(api_key)
    api_key_id = record.id

    with lock:
        sse_queues.setdefault(api_key_id, []).append(object())

    yield

    with lock:
        if api_key_id in sse_queues:
            sse_queues[api_key_id].pop()
            if not sse_queues[api_key_id]:
                del sse_queues[api_key_id]
