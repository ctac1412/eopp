from datetime import UTC, datetime


def _create_operator_profile(client, admin_token):
    company = client.post(
        "/api/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Operator Auth Co"},
    ).json()
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Cookie Operator",
            "login": "cookie.operator",
            "password": "strong-password",
            "company_id": company["id"],
            "operator_profile": {
                "company_id": company["id"],
                "company_ids": [company["id"]],
                "active": True,
                "nickname": "cookie-op",
            },
        },
    )
    assert user.status_code == 200
    return user.json()["operator_profile"]


def _create_master_key(client, admin_token, operator_id):
    from src.repositories import api_key_repo

    operator = client.get("/api/admin/operators", headers={"X-Admin-Token": admin_token}).json()
    operator_row = next(row for row in operator if row["id"] == operator_id)
    company_id = operator_row["company_ids"][0]
    executor = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Operator Auth Executor",
            "login": f"operator.auth.executor.{datetime.now(UTC).timestamp()}",
            "password": "strong-password",
            "company_id": company_id,
            "executor_access": {"company_ids": [company_id], "all_companies": False},
        },
    )
    assert executor.status_code == 200
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={
            "label": f"operator-auth-master-{datetime.now(UTC).timestamp()}",
            "user_id": executor.json()["id"],
            "company_id": company_id,
        },
    )
    assert key.status_code == 200
    record = api_key_repo.get_key_record(key.json()["key"])
    assert record is not None
    linked = client.put(
        f"/api/admin/operators/{operator_id}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": record.id},
    )
    assert linked.status_code == 200
    return record


def test_operator_masters_requires_cookie_session(client, admin_token):
    operator = _create_operator_profile(client, admin_token)
    client.cookies.clear()

    anonymous = client.get(f"/api/operators/{operator['uuid']}/masters")

    assert anonymous.status_code == 401
    assert anonymous.json() == {"error": "Unauthorized"}


def test_operator_masters_accepts_cookie_session_without_owner_check(client, admin_token):
    operator = _create_operator_profile(client, admin_token)
    _create_master_key(client, admin_token, operator["operator_id"])

    response = client.get(f"/api/operators/{operator['uuid']}/masters")

    assert response.status_code == 200
    assert any(row["assigned"] for row in response.json())


def test_operator_unlink_requires_cookie_session(client, admin_token):
    operator = _create_operator_profile(client, admin_token)
    master = _create_master_key(client, admin_token, operator["operator_id"])
    client.cookies.clear()

    response = client.post(
        f"/api/operators/{operator['uuid']}/unlink",
        json={"master_id": master.id},
    )

    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}


def test_operator_stream_requires_cookie_session(client, admin_token):
    operator = _create_operator_profile(client, admin_token)
    client.cookies.clear()

    response = client.get(f"/api/operators/{operator['uuid']}/stream")

    assert response.status_code == 401
    assert response.json() == {"error": "Unauthorized"}
