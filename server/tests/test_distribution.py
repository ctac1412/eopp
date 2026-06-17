"""Tests for distributed icon-click captcha solving."""

import base64
import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw


def _make_icon_click_captcha() -> dict:
    """Create a synthetic icon-click captcha with 5 icons at known positions."""
    main = Image.new("RGB", (300, 300), (50, 50, 80))
    draw = ImageDraw.Draw(main)
    coords = [(50, 150), (100, 150), (150, 150), (200, 150), (250, 150)]
    for i, (x, y) in enumerate(coords):
        draw.ellipse((x - 15, y - 15, x + 15, y + 15), fill=(200, 50, 50))
        draw.text((x - 4, y - 8), str(i + 1), fill=(255, 255, 255))
    main_buf = io.BytesIO()
    main.save(main_buf, format="PNG")
    main_b64 = base64.b64encode(main_buf.getvalue()).decode()

    icons = Image.new("RGB", (250, 40), (30, 30, 50))
    icons_draw = ImageDraw.Draw(icons)
    for i in range(5):
        x0 = i * 50
        icons_draw.rectangle((x0 + 5, 5, x0 + 45, 35), fill=(200, 50, 50))
        icons_draw.text((x0 + 20, 12), str(i + 1), fill=(255, 255, 255))
    icons_buf = io.BytesIO()
    icons.save(icons_buf, format="PNG")
    icons_b64 = base64.b64encode(icons_buf.getvalue()).decode()

    return {
        "puzzle": {
            "imageBase64": main_b64,
            "iconsBase64": icons_b64,
        },
        "coords": coords,
    }


@pytest.fixture(autouse=True)
def isolate_db(monkeypatch):
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
def client(isolate_db):
    from src.app import create_app
    return TestClient(create_app())


@pytest.fixture
def admin_token(client):
    from src.db import list_keys
    admin_key = next((key for key in list_keys() if key["is_admin"]), None)
    assert admin_key is not None
    response = client.post(
        "/admin/auth",
        json={"login": "admin", "password": admin_key["key"]},
    )
    assert response.status_code == 200
    return response.cookies["eopp_session"]


@pytest.fixture
def company_id(client, admin_token):
    response = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Distribution Company"},
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture
def key_owner_id(client, admin_token, company_id):
    response = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Distribution Key Owner",
            "login": "distribution.key.owner",
            "password": "strong-password",
            "company_id": company_id,
            "executor_access": {
                "all_companies": False,
                "company_ids": [company_id],
            },
        },
    )
    assert response.status_code == 200
    return response.json()["id"]


@pytest.fixture
def master_key(client, admin_token, key_owner_id):
    r = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "master", "max_uses": 1000, "user_id": key_owner_id},
    )
    assert r.status_code == 200
    return r.json()["key"]


@pytest.fixture
def operator_key(client, admin_token, key_owner_id):
    r = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "operator", "max_uses": 1000, "user_id": key_owner_id},
    )
    assert r.status_code == 200
    return r.json()["key"]


def _login_key_owner(client):
    response = client.post(
        "/auth/login",
        json={"login": "distribution.key.owner", "password": "strong-password"},
    )
    assert response.status_code == 200


class TestDistributionFlow:
    def test_register_usage_with_distribution(self, client, master_key, admin_token):
        """Register usage with parallel_operators=2 should create distribution."""
        _login_key_owner(client)
        r = client.post("/register-usage", json={
            "reservation_id": "test-res-001",
            "captcha_id": "test-captcha",
            "parallel_operators": 2,
        })
        assert r.status_code == 200

    def test_solve_captcha_creates_distribution_state(self, client, master_key, admin_token):
        """Icon-click captcha with distribution should create state."""
        _login_key_owner(client)
        captcha = _make_icon_click_captcha()
        r = client.post("/solve-captcha", json={
            "auto_solve": False,
            "reservation_id": "test-res-001",
            "puzzle": captcha["puzzle"],
            "token": "test-token",
        })
        assert r.status_code in (200, 412)  # 412 if no SSE stream, 200 on timeout

    def test_distribution_answer_404_without_state(self, client, master_key):
        """Answer for non-existent captcha should 404."""
        _login_key_owner(client)
        r = client.post("/distribution/answer", json={
            "captcha_id": "fake_captcha",
            "operator_id": 0,
            "icon_position": 0,
            "x": 50,
            "y": 150,
        })
        assert r.status_code == 404

    def test_operator_subscribe_unsubscribe(self, client, master_key, admin_token, company_id):
        """Create operator, link to master, verify."""
        from src.repositories import api_key_repo

        r = client.post(
            "/admin/users",
            headers={"X-Admin-Token": admin_token},
            json={
                "name": "Distribution Operator",
                "login": "distribution.operator",
                "password": "strong-password",
                "company_id": company_id,
                "operator_profile": {
                    "company_id": company_id,
                    "company_ids": [company_id],
                    "active": True,
                    "nickname": "test-op",
                },
            },
        )
        assert r.status_code == 200
        op = r.json()["operator_profile"]
        assert "uuid" in op
        uuid = op["uuid"]
        master = api_key_repo.get_key_record(master_key)
        assert master is not None

        r2 = client.put(
            f"/admin/operators/{op['operator_id']}/link",
            headers={"X-Admin-Token": admin_token},
            json={"master_key_id": master.id},
        )
        assert r2.status_code == 200

        # Operator page loads (SPA — renders client-side)
        r3 = client.get(f"/operators/{uuid}")
        assert r3.status_code == 200

    def test_distribution_constants(self):
        """Verify distribution constants are correct."""
        from src.constants import DISTRIBUTION, ICON_ORDER
        assert DISTRIBUTION[1] == {"0": [0, 1, 2, 3, 4]}
        assert DISTRIBUTION[2] == {"0": [0, 1, 2], "1": [4, 3]}
        assert len(DISTRIBUTION[2]["0"]) == 3
        assert len(DISTRIBUTION[2]["1"]) == 2
        # 3 participants (2 ops): each gets unique first icon
        assert DISTRIBUTION[3] == {"0": [0, 1], "1": [4, 3], "2": [2]}
        # 4 participants (3 ops)
        assert DISTRIBUTION[4] == {"0": [0, 1], "1": [4], "2": [3], "3": [2]}
        # 5 participants (4 ops)
        assert DISTRIBUTION[5] == {"0": [0], "1": [4], "2": [3], "3": [2], "4": [1]}
        # 6 participants (5 ops) — master sits out
        assert DISTRIBUTION[6] == {"0": [], "1": [4], "2": [3], "3": [2], "4": [1], "5": [0]}
        # ICON_ORDER has full order for each config
        assert len(ICON_ORDER) == 5
        for n, ops in ICON_ORDER.items():
            for op_id, order in ops.items():
                assert len(order) == 5, f"n={n} op={op_id} has {len(order)} icons"
                assert set(order) == set(range(5)), f"n={n} op={op_id} missing icons"
                assigned = DISTRIBUTION[n].get(op_id, [])
                assert order[:len(assigned)] == assigned, f"n={n} op={op_id}: assigned not first"

    def test_crop_icons(self):
        """Verify crop function works for distribution."""
        from src.captcha_solver_engine.images import crop_icons_for_distribution
        captcha = _make_icon_click_captcha()
        main_b64 = captcha["puzzle"]["imageBase64"]
        coords = [{"x": x, "y": y} for x, y in captcha["coords"]]
        cache = crop_icons_for_distribution(main_b64, coords, pad=60)
        assert len(cache) == 5
        for pos in range(5):
            assert pos in cache
            assert "image" in cache[pos]
            assert "crop_box" in cache[pos]
            assert len(cache[pos]["image"]) > 0


class TestDistributionWithSSE:
    """Integration tests with SSE stream."""

    def test_distribution_state_machine(self, client, master_key, admin_token):
        """Test distribution state init, answer submission, completion."""
        from src.routes.distribution import (
            init_distribution_state,
            distribution_states,
            wait_for_distribution_answer_archives,
        )
        import threading
        _login_key_owner(client)

        captcha = _make_icon_click_captcha()
        from src.captcha_solver_engine.images import crop_icons_for_distribution
        from src.captcha_assembly import captcha_hash

        cid = captcha_hash(captcha)
        coords = [{"x": x, "y": y} for x, y in captcha["coords"]]
        cache = crop_icons_for_distribution(captcha["puzzle"]["imageBase64"], coords, pad=60)

        event = threading.Event()
        init_distribution_state(
            captcha_id=cid,
            event=event,
            usage_log_id=1,
            api_key_id=1,
            num_operators=2,
            icons_cache=cache,
            captcha_data=captcha,
        )

        assert cid in distribution_states
        state = distribution_states[cid]
        assert state["num_operators"] == 2
        assert state["total_icons"] == 5
        assert 0 in state["operators"]
        assert 1 in state["operators"]
        assert state["operators"][0]["assigned"] == [0, 1, 2]

        # Operator 0 answers icon 0
        r = client.post("/distribution/answer", json={
            "captcha_id": cid,
            "operator_id": 0,
            "icon_position": 0,
            "x": coords[0]["x"],
            "y": coords[0]["y"],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["total_solved"] == 1
        assert data["icon_position"] == 1  # next icon for master

        # Operator 1 answers icon 4
        r = client.post("/distribution/answer", json={
            "captcha_id": cid,
            "operator_id": 1,
            "icon_position": 4,
            "x": coords[4]["x"],
            "y": coords[4]["y"],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["total_solved"] == 2
        assert data["icon_position"] == 3  # next icon for operator 1

        # Answer remaining icons
        for pos in [1, 2, 3]:
            r = client.post("/distribution/answer", json={
                "captcha_id": cid,
                "operator_id": 0 if pos <= 2 else 1,
                "icon_position": pos,
                "x": coords[pos]["x"],
                "y": coords[pos]["y"],
            })
            assert r.status_code == 200

            if pos < 3:
                data = r.json()
                assert not data.get("complete")
            else:
                data = r.json()
                assert data.get("complete")
                assert len(data["coordinates"]) == 5

        # State should be cleaned up
        assert cid not in distribution_states
        wait_for_distribution_answer_archives(timeout=5)
