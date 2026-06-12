"""Regression tests for Phase 7 defensive server module loading."""

from __future__ import annotations

import sys
import types

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient


def _install_manifest_module(name: str, manifest) -> None:
    """Install an in-memory manifest module so registry tests do not touch disk."""

    module = types.ModuleType(name)
    module.manifest = manifest
    sys.modules[name] = module


def test_registry_loads_good_modules_and_disables_broken_modules():
    """A broken side manifest is recorded as disabled without aborting registration."""

    from src.platform.module_registry import ModuleManifest, register_modules

    router = APIRouter()

    @router.get("/pilot")
    async def pilot():
        return {"ok": True}

    _install_manifest_module(
        "tests.fake_good_manifest",
        ModuleManifest(name="fake_good", routers=(router,), permissions=("fake.view",)),
    )

    app = FastAPI()
    statuses = register_modules(
        app,
        ("tests.fake_good_manifest", "tests.fake_missing_manifest"),
    )

    assert [status.name for status in statuses] == ["fake_good", "tests.fake_missing_manifest"]
    assert statuses[0].enabled is True
    assert statuses[0].routers == 1
    assert statuses[0].permissions == ("fake.view",)
    assert statuses[1].enabled is False
    assert "No module named" in statuses[1].error
    assert TestClient(app).get("/pilot").status_code == 200


def test_module_health_reports_disabled_side_modules(client, monkeypatch):
    """Health exposes module status while core health remains available."""

    from src.platform.module_registry import ModuleStatus

    module_statuses = (
        ModuleStatus(name="billing", enabled=True, routers=0),
        ModuleStatus(name="training", enabled=False, error="boom"),
    )
    monkeypatch.setattr(client.app.state, "module_statuses", module_statuses, raising=False)

    response = client.get("/health/modules")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "modules": [
            {
                "name": "billing",
                "enabled": True,
                "routers": 0,
                "event_handlers": 0,
                "job_handlers": 0,
                "permissions": [],
                "error": None,
            },
            {
                "name": "training",
                "enabled": False,
                "routers": 0,
                "event_handlers": 0,
                "job_handlers": 0,
                "permissions": [],
                "error": "boom",
            },
        ],
    }


def test_default_module_health_reports_pilot_manifests(client):
    """The default app exposes pilot billing and training module manifests."""

    response = client.get("/health/modules")

    assert response.status_code == 200
    body = response.json()
    modules = {module["name"]: module for module in body["modules"]}
    assert body["status"] == "ok"
    assert modules["billing"]["enabled"] is True
    assert modules["billing"]["job_handlers"] == 3
    assert modules["training"]["enabled"] is True
    assert modules["training"]["routers"] == 1


def test_app_starts_core_routes_when_configured_side_module_is_broken(
    isolated_api_db,
    monkeypatch,
):
    """Core app creation and core health survive configured side-module import failure."""

    from src.app import create_app

    monkeypatch.setenv("EOPP_MODULE_MANIFESTS", "tests.fake_missing_manifest")
    client = TestClient(create_app())

    assert client.get("/health").status_code == 200

    modules_response = client.get("/health/modules")
    assert modules_response.status_code == 200
    assert modules_response.json()["status"] == "degraded"
    assert modules_response.json()["modules"][0]["name"] == "tests.fake_missing_manifest"
    assert modules_response.json()["modules"][0]["enabled"] is False
