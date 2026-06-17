from datetime import UTC, datetime


def _create_executor_key(client, admin_token):
    suffix = datetime.now(UTC).timestamp()
    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Cookie Extension User",
            "login": f"cookie.extension.{suffix}",
            "password": "strong-password",
            "executor_access": {"all_companies": True, "company_ids": []},
        },
    )
    assert user.status_code == 200
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": f"cookie-extension-key-{suffix}", "user_id": user.json()["id"]},
    )
    assert key.status_code == 200
    return user.json(), key.json()


def _login_as(client, login: str):
    client.cookies.clear()
    response = client.post(
        "/api/auth/login",
        json={"login": login, "password": "strong-password"},
    )
    assert response.status_code == 200


def _attach_active_stream(api_key: str):
    from src.repositories import api_key_repo
    from src.sse.manager import lock, registry, sse_queues

    record = api_key_repo.get_key_record(api_key)
    assert record is not None
    connection = registry.register_connection(api_key_id=record.id, ip="test-cookie-extension")
    with lock:
        sse_queues.setdefault(record.id, []).append(object())
    return record.id, connection.queue


def _detach_active_stream(api_key_id: int, queue):
    from src.sse.manager import lock, registry, sse_queues

    registry.unregister_connection(queue, api_key_id)
    with lock:
        if api_key_id in sse_queues:
            sse_queues[api_key_id].pop()
            if not sse_queues[api_key_id]:
                del sse_queues[api_key_id]


def test_extension_usage_endpoints_require_cookie_not_api_key(client, admin_token):
    user, key = _create_executor_key(client, admin_token)
    stream_key_id, stream_queue = _attach_active_stream(key["key"])
    try:
        client.cookies.clear()
        old_register = client.post(
            "/api/register-usage",
            json={"api_key": key["key"], "reservation_id": "old-api-key-only"},
        )
        assert old_register.status_code == 401

        _login_as(client, user["login"])
        registered = client.post(
            "/api/register-usage",
            json={"reservation_id": "cookie-session"},
        )
        assert registered.status_code == 200
        usage_log_id = registered.json()["usage_log_id"]

        confirmed = client.post(
            "/api/confirm-usage",
            json={"usage_log_id": usage_log_id, "slot_date": "2026-06-17"},
        )
        assert confirmed.status_code == 200

        failed = client.post(
            "/api/fail-usage",
            json={
                "usage_log_id": usage_log_id,
                "error_message": "ignored-after-confirm",
                "error_stage": "test",
            },
        )
        assert failed.status_code == 200
    finally:
        _detach_active_stream(stream_key_id, stream_queue)


def test_extension_status_and_stream_use_cookie_session_key(client, admin_token):
    user, key = _create_executor_key(client, admin_token)
    stream_key_id, stream_queue = _attach_active_stream(key["key"])
    try:
        client.cookies.clear()
        old_status = client.get(f"/api/api-key-status?key={key['key']}")
        assert old_status.status_code == 401

        old_check = client.get(f"/api/check-stream?api_key={key['key']}")
        assert old_check.status_code == 401

        _login_as(client, user["login"])
        status = client.get("/api/api-key-status")
        assert status.status_code == 200
        assert status.json()["valid"] is True
        assert status.json()["label"] == key["label"]

        check = client.get("/api/check-stream")
        assert check.status_code == 200
        assert check.json()["valid"] is True
        assert check.json()["has_active_stream"] is True
    finally:
        _detach_active_stream(stream_key_id, stream_queue)


def test_remaining_token_style_routes_require_cookie(client, admin_token):
    _user, key = _create_executor_key(client, admin_token)
    client.cookies.clear()

    solve = client.post(
        "/api/solve",
        json={
            "captcha_id": "missing-captcha",
            "variantIndex": 0,
            "api_key": key["key"],
        },
    )
    assert solve.status_code == 401

    usage_log = client.get(f"/api/usage-log?api_key={key['key']}")
    assert usage_log.status_code == 401

    slots_group = client.post(
        "/api/slots-group/claim",
        json={"group_key": "reservation-1", "client_id": "client-1"},
    )
    assert slots_group.status_code == 401

    trigger_test = client.post(
        "/api/trigger-test",
        json={"api_key": key["key"], "captcha_id": "missing-captcha"},
    )
    assert trigger_test.status_code == 401

    answer = client.post(
        "/api/distribution/answer",
        json={
            "captcha_id": "missing-captcha",
            "operator_id": 1,
            "icon_position": 0,
            "x": 1,
            "y": 1,
        },
    )
    assert answer.status_code == 401
