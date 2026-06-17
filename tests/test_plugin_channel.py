"""Tests for anonymous channel plugin sessions and master visibility."""


def _create_company(client, admin_token, name, aliases=None):
    response = client.post(
        "/api/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": name, "aliases": aliases or []},
    )
    assert response.status_code == 201
    return response.json()


def _create_master(client, admin_token, *, name, login, company_id, scope="own_company"):
    executor_access = (
        {"all_companies": True, "company_ids": []}
        if scope == "all_companies"
        else {"all_companies": False, "company_ids": [company_id]}
    )
    response = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": name,
            "login": login,
            "password": "strong-password",
            "role": "manager",
            "company_id": company_id,
            "active": True,
            "executor_access": executor_access,
        },
    )
    assert response.status_code == 200
    return response.json()


def _create_master_key(client, admin_token, *, label, user_id):
    response = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": label, "user_id": user_id},
    )
    assert response.status_code == 200
    return response.json()


def _login(client, login):
    response = client.post(
        "/api/auth/login",
        json={"login": login, "password": "strong-password"},
    )
    assert response.status_code == 200
    return response


def _open_channel(client, *, company_name=None, reservation_id="abc-reservation"):
    raw_snapshot = {
        "dom": {"visibleText": f"Company: {company_name or ''}"},
        "reservation": {
            "id": reservation_id,
            "userData": {
                "organizationName": company_name,
                "fio": "Ivan Test",
            },
        },
    }
    response = client.post(
        "/plugin-channel/sessions/open",
        json={
            "installation_id": "install-1",
            "extension_version": "0.1.0",
            "route_kind": "reservation_card",
            "page_url": f"https://eopp.epd-portal.ru/ru/reservations/reservation/{reservation_id}/edit",
            "raw_snapshot": raw_snapshot,
            "executor_token": "executor-test-token",
        },
    )
    assert response.status_code == 200
    return response.json()


def test_open_channel_resolves_existing_company_and_is_visible_to_company_master(client, admin_token):
    company = _create_company(client, admin_token, "Existing Carrier", ["Carrier Alias"])
    _create_master(
        client,
        admin_token,
        name="Company Master",
        login="company.master.channel",
        company_id=company["id"],
    )

    opened = _open_channel(client, company_name="Carrier Alias")

    assert opened["company"]["id"] == company["id"]
    assert opened["visibility"] == "company_masters"
    assert opened["eopp_user"]["name"] == "Ivan Test"
    assert opened["executor_token"] == "executor-test-token"

    _login(client, "company.master.channel")
    sessions = client.get("/api/admin/plugin-channel/sessions")
    assert sessions.status_code == 200
    assert [row["id"] for row in sessions.json()["sessions"]] == [opened["session_id"]]
    assert sessions.json()["sessions"][0]["executor_token"] == "executor-test-token"


def test_open_channel_creates_missing_company_visible_only_to_global_master(client, admin_token):
    existing = _create_company(client, admin_token, "Known Company")
    _create_master(
        client,
        admin_token,
        name="Local Master",
        login="local.master.channel",
        company_id=existing["id"],
    )
    _create_master(
        client,
        admin_token,
        name="Global Master",
        login="global.master.channel",
        company_id=existing["id"],
        scope="all_companies",
    )

    opened = _open_channel(client, company_name="New Auto Company")

    assert opened["company"]["name"] == "New Auto Company"
    assert opened["company"]["auto_created"] is True
    assert opened["visibility"] == "global_masters"

    _login(client, "local.master.channel")
    local_sessions = client.get("/api/admin/plugin-channel/sessions")
    assert local_sessions.status_code == 200
    assert local_sessions.json()["sessions"] == []

    client.post("/api/auth/logout")
    _login(client, "global.master.channel")
    global_sessions = client.get("/api/admin/plugin-channel/sessions")
    assert global_sessions.status_code == 200
    assert [row["id"] for row in global_sessions.json()["sessions"]] == [opened["session_id"]]


def test_super_admin_without_executor_access_does_not_see_channel_sessions(client, admin_token):
    opened = _open_channel(client, company_name="Admin Visible Company")

    created = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Channel Super Admin",
            "login": "channel.super.admin",
            "password": "strong-password",
            "role": "super_admin",
            "active": True,
        },
    )
    assert created.status_code == 200

    login = client.post("/api/auth/login", json={"login": "channel.super.admin", "password": "strong-password"})
    assert login.status_code == 200

    sessions = client.get("/api/admin/plugin-channel/sessions")
    assert sessions.status_code == 200
    assert sessions.json()["sessions"] == []


def test_root_channel_opens_without_reservation_id_and_rejects_unknown_command(client, admin_token):
    company = _create_company(client, admin_token, "Root Company")
    _create_master(
        client,
        admin_token,
        name="Root Master",
        login="root.master.channel",
        company_id=company["id"],
    )
    opened = client.post(
        "/plugin-channel/sessions/open",
        json={
            "installation_id": "install-root",
            "extension_version": "0.1.0",
            "route_kind": "eopp_root",
            "page_url": "https://eopp.epd-portal.ru/ru/",
            "raw_snapshot": {
                "user": {"company": "Root Company", "name": "Root User"},
                "dom": {"visibleText": "Root Company"},
            },
        },
    )
    assert opened.status_code == 200
    body = opened.json()
    assert body["reservation_id"] is None
    assert body["route_kind"] == "eopp_root"

    refreshed = client.post(
        f"/plugin-channel/sessions/{body['session_id']}/snapshot",
        json={
            "channel_secret": body["channel_secret"],
            "route_kind": "reservation_card",
            "page_url": "https://eopp.epd-portal.ru/ru/reservations/reservation/card-42/edit",
            "raw_snapshot": {
                "user": {"company": "Root Company", "name": "Root User"},
                "reservation": {"id": "card-42"},
                "dom": {"visible_text": "Компания: Root Company"},
            },
        },
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["session"]["reservation_id"] == "card-42"

    _login(client, "root.master.channel")
    claim = client.post(f"/api/admin/plugin-channel/sessions/{body['session_id']}/claim")
    assert claim.status_code == 200

    accepted = client.post(
        f"/api/admin/plugin-channel/sessions/{body['session_id']}/commands",
        json={"type": "refresh_snapshot", "payload": {}},
    )
    assert accepted.status_code == 200
    assert accepted.json()["command"]["timeout_seconds"] == 15
    assert accepted.json()["command"]["requires_claim"] is True

    polled = client.get(
        f"/plugin-channel/sessions/{body['session_id']}/commands",
        params={"channel_secret": body["channel_secret"]},
    )
    assert polled.status_code == 200
    assert polled.json()["commands"][0]["type"] == "refresh_snapshot"
    assert polled.json()["commands"][0]["allowed_session_states"] == ["claimed", "open"]

    rejected = client.post(
        f"/api/admin/plugin-channel/sessions/{body['session_id']}/commands",
        json={"type": "run_arbitrary_js", "payload": {}},
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"] == "unknown_command"

    closed = client.post(f"/api/admin/plugin-channel/sessions/{body['session_id']}/close")
    assert closed.status_code == 200
    assert closed.json()["session"]["status"] == "closed"


def test_channel_can_be_assigned_to_master_key_and_released(client, admin_token):
    company = _create_company(client, admin_token, "Dispatch Company")
    master = _create_master(
        client,
        admin_token,
        name="Dispatch Master",
        login="dispatch.master.channel",
        company_id=company["id"],
    )
    master_key = _create_master_key(
        client,
        admin_token,
        label="Dispatch Master Key",
        user_id=master["id"],
    )
    opened = _open_channel(client, company_name="Dispatch Company")

    _login(client, "dispatch.master.channel")
    assigned = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/assign",
        json={"master_key_id": master_key["id"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["session"]["status"] == "claimed"
    assert assigned.json()["session"]["claimed_master_key_id"] == master_key["id"]

    sessions = client.get("/api/admin/plugin-channel/sessions")
    assert sessions.status_code == 200
    assert sessions.json()["sessions"][0]["claimed_master_key_id"] == master_key["id"]

    released = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/release",
    )
    assert released.status_code == 200
    assert released.json()["session"]["status"] == "open"
    assert released.json()["session"]["claimed_master_key_id"] is None


def test_channel_cannot_be_assigned_to_master_key_from_another_company(client, admin_token):
    channel_company = _create_company(client, admin_token, "Channel Company")
    other_company = _create_company(client, admin_token, "Other Company")
    channel_master = _create_master(
        client,
        admin_token,
        name="Channel Master",
        login="channel.master.channel",
        company_id=channel_company["id"],
    )
    _create_master_key(
        client,
        admin_token,
        label="Channel Master Key",
        user_id=channel_master["id"],
    )
    other_master = _create_master(
        client,
        admin_token,
        name="Other Master",
        login="other.master.channel",
        company_id=other_company["id"],
    )
    other_key = _create_master_key(
        client,
        admin_token,
        label="Other Master Key",
        user_id=other_master["id"],
    )
    opened = _open_channel(client, company_name=channel_company["name"])

    _login(client, "channel.master.channel")
    assigned = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/assign",
        json={"master_key_id": other_key["id"]},
    )

    assert assigned.status_code == 403
    assert assigned.json()["error"] == "master_key_not_allowed_for_channel"


def test_channel_can_be_reassigned_between_master_keys_in_same_company(client, admin_token):
    company = _create_company(client, admin_token, "Reassign Company")
    first_master = _create_master(
        client,
        admin_token,
        name="First Channel Master",
        login="first.channel.master",
        company_id=company["id"],
    )
    second_master = _create_master(
        client,
        admin_token,
        name="Second Channel Master",
        login="second.channel.master",
        company_id=company["id"],
    )
    first_key = _create_master_key(
        client,
        admin_token,
        label="First Channel Key",
        user_id=first_master["id"],
    )
    second_key = _create_master_key(
        client,
        admin_token,
        label="Second Channel Key",
        user_id=second_master["id"],
    )
    opened = _open_channel(client, company_name="Reassign Company")

    _login(client, "first.channel.master")
    first_assignment = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/assign",
        json={"master_key_id": first_key["id"]},
    )
    assert first_assignment.status_code == 200
    assert first_assignment.json()["session"]["claimed_master_key_id"] == first_key["id"]

    second_assignment = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/assign",
        json={"master_key_id": second_key["id"]},
    )
    assert second_assignment.status_code == 200
    assert second_assignment.json()["session"]["claimed_master_key_id"] == second_key["id"]
    assert second_assignment.json()["session"]["claimed_by_user_id"] == second_master["id"]


def test_api_keys_response_includes_executor_scope_for_channel_dispatch(client, admin_token):
    company = _create_company(client, admin_token, "Dispatch Metadata Company")
    master = _create_master(
        client,
        admin_token,
        name="Metadata Master",
        login="metadata.master.channel",
        company_id=company["id"],
    )
    key = _create_master_key(
        client,
        admin_token,
        label="Metadata Master Key",
        user_id=master["id"],
    )

    response = client.get("/api/api-keys", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    row = next(item for item in response.json() if item["id"] == key["id"])
    assert row["is_master_key"] is True
    assert row["executor_all_companies"] is False
    assert row["executor_company_ids"] == [company["id"]]
    assert row["executor_company_names"] == ["Dispatch Metadata Company"]


def test_global_executor_master_key_can_be_assigned_channel_from_any_company(client, admin_token):
    admin_company = _create_company(client, admin_token, "Admin Home Company")
    channel_company = _create_company(client, admin_token, "Admin Foreign Channel Company")
    created = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Dispatch Super Admin",
            "login": "dispatch.super.admin",
            "password": "strong-password",
            "role": "super_admin",
            "company_id": admin_company["id"],
            "active": True,
            "executor_access": {"all_companies": True, "company_ids": []},
        },
    )
    assert created.status_code == 200
    key = _create_master_key(
        client,
        admin_token,
        label="Dispatch Super Admin Key",
        user_id=created.json()["id"],
    )
    opened = _open_channel(client, company_name=channel_company["name"])

    _login(client, "dispatch.super.admin")
    assigned = client.post(
        f"/api/admin/plugin-channel/sessions/{opened['session_id']}/assign",
        json={"master_key_id": key["id"]},
    )

    assert assigned.status_code == 200
    assert assigned.json()["session"]["claimed_master_key_id"] == key["id"]
