"""Regression tests for Phase 5 RBAC and audit boundaries."""

import ast
import importlib
import inspect
import json


def test_core_access_contract_is_side_module_free():
    """Access contracts in protected core must stay DTO/protocol-only."""
    module = importlib.import_module("src.core.contracts.permissions")
    tree = ast.parse(inspect.getsource(module))
    imported_names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported_names.append(node.module or "")

    assert hasattr(module, "AccessDecision")
    assert hasattr(module, "AccessChecker")
    assert not any(".modules." in name or name.startswith("src.modules") for name in imported_names)
    assert not any(".repositories." in name or name.startswith("src.repositories") for name in imported_names)


def test_access_service_maps_password_sessions_to_permissions(client, admin_token, legacy_admin_api_key):
    """Password sessions are the only admin actor tokens accepted by RBAC."""
    from src.modules.access.permissions import Permission
    from src.modules.access.service import AccessService

    service = AccessService()

    view_decision = service.authorize_token(admin_token, Permission.BILLING_VIEW)
    edit_decision = service.authorize_token(admin_token, Permission.TARIFF_EDIT)
    legacy_decision = service.authorize_token(legacy_admin_api_key, Permission.BILLING_VIEW)

    assert view_decision.allowed is True
    assert edit_decision.allowed is True
    assert view_decision.actor_id is not None
    assert view_decision.role == "super_admin"
    assert legacy_decision.allowed is False
    assert legacy_decision.reason == "unauthenticated"


def test_manager_can_view_billing_but_cannot_edit_tariffs(client, admin_token):
    """RBAC must allow read-only admin work without allowing finance mutation."""
    client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Manager",
            "login": "manager.rbac",
            "password": "strong-password",
            "role": "manager",
        },
    )
    client.post(
        "/admin/logout",
    )
    client.post("/admin/auth", json={"login": "manager.rbac", "password": "strong-password"})

    view = client.get("/admin/invoices")
    edit = client.put(
        "/admin/tariffs/1",
        json={"price_create": 100, "price_reschedule": 50},
    )

    assert view.status_code == 200
    assert edit.status_code == 403
    assert "permission" in edit.json()["error"]


def test_plugin_token_owner_change_is_audited_with_actor_permission_and_target(client, admin_token):
    """Security-sensitive plugin token ownership changes are synchronously audited."""
    from src.modules.audit.repository import AuditRepository

    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Token Owner",
            "login": "token.owner",
            "password": "strong-password",
            "role": "manager",
            "active": True,
        },
    )
    assert user.status_code == 200
    created = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "audit_rbac_target"},
    ).json()

    response = client.patch(
        f"/admin/api-keys/{created['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"user_id": user.json()["id"]},
    )

    assert response.status_code == 200
    rows = AuditRepository().list_events(limit=20)
    assert any(
        row["action"] == "api_key.changed"
        and row["target_type"] == "api_key"
        and row["target_id"] == created["id"]
        and row["permission"] == "admin.users.manage"
        for row in rows
    )
    changed = next(row for row in rows if row["action"] == "api_key.changed" and row["target_id"] == created["id"])
    assert json.loads(changed["new_value"])["user_id"] == str(user.json()["id"])


def test_admin_auth_success_and_failure_are_audited(client, admin_token, legacy_admin_api_key):
    """Login attempts are security events even when the token is invalid."""
    from src.modules.audit.repository import AuditRepository

    ok = client.post("/admin/auth", json={"login": "admin", "password": legacy_admin_api_key})
    failed = client.post("/admin/auth", json={"login": "admin", "password": "definitely-not-valid"})

    assert ok.status_code == 200
    assert failed.status_code == 401

    actions = [row["action"] for row in AuditRepository().list_events(limit=20)]
    assert "admin.login.succeeded" in actions
    assert "admin.login.failed" in actions


def test_audit_log_endpoint_requires_audit_view(client, admin_token, legacy_admin_api_key):
    """Authorized admins can inspect audit rows through a dedicated endpoint."""
    client.post("/admin/auth", json={"login": "admin", "password": legacy_admin_api_key})

    response = client.get("/admin/audit", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    assert any(row["action"] == "admin.login.succeeded" for row in response.json())


def test_tariff_change_emits_business_audit_outbox_event(client, admin_token):
    """Finance mutations are recorded as best-effort business audit outbox events."""
    from src.platform.outbox.publisher import queued_events

    created = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "tariff_audit_target"},
    ).json()

    response = client.put(
        f"/admin/tariffs/{created['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"price_create": 100, "price_reschedule": 50},
    )

    assert response.status_code == 200
    assert any(
        event.event_type == "audit.business"
        and event.payload["action"] == "tariff.changed"
        and event.payload["target_id"] == created["id"]
        for event in queued_events()
    )


def test_invoice_and_payout_actions_emit_business_audit_events(client, admin_token):
    """Invoice and payout mutations are represented in the business audit stream."""
    from src.platform.outbox.publisher import queued_events

    invoice = client.post(
        "/admin/invoices",
        headers={"X-Admin-Token": admin_token},
        json={"invoice_number": "INV-RBAC-AUDIT", "debt_amount": 100, "total_amount": 100},
    )
    assert invoice.status_code == 200
    invoice_id = invoice.json()["id"]
    payout = client.post(
        "/admin/payouts",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "RBAC audit payout",
            "invoice_ids": [invoice_id],
            "expense_ids": [],
            "user_splits": [{"user_id": 1, "split_pct": 100}],
        },
    )

    assert payout.status_code == 200
    events = queued_events()
    assert any(event.event_type == "audit.business" and event.payload["action"] == "invoice.generated" for event in events)
    assert any(event.event_type == "audit.business" and event.payload["action"] == "payout.changed" for event in events)
