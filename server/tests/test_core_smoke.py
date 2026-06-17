import threading
import time


def _puzzle_payload(api_key: str, **overrides):
    payload = {
        "auto_solve": False,
        "timeout_metadata": True,
        "reservation_id": "reservation-core-smoke",
        "puzzle": {
            "tiles": [{"tileId": "tile-a", "imageData": "a"}],
            "variantsCapture": [["tile-a"], ["tile-a"]],
        },
    }
    payload.update(overrides)
    return payload


def _wait_for_pending(captcha_id: str, timeout: float = 2.0) -> None:
    from src.sse import lock, pending

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with lock:
            if captcha_id in pending:
                return
        time.sleep(0.01)
    raise AssertionError(f"captcha {captcha_id} did not enter pending store")


def test_manual_captcha_flow_solves_pending_session(client, api_key, monkeypatch):
    from src import captcha_assembly
    from src.routes import captcha as captcha_route
    from src.services import captcha_file_service

    monkeypatch.setattr(
        captcha_route,
        "assemble_captchas",
        lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
    )
    monkeypatch.setattr(captcha_file_service, "ensure_analysis_metadata", lambda data: False)

    payload = _puzzle_payload(api_key)
    captcha_id = captcha_assembly.captcha_hash({"puzzle": payload["puzzle"]})
    result_holder = {}

    def call_solve_captcha():
        result_holder["response"] = client.post("/api/solve-captcha", json=payload)

    worker = threading.Thread(target=call_solve_captcha)
    worker.start()
    _wait_for_pending(captcha_id)

    solve_response = client.post(
        "/api/solve",
        json={"captcha_id": captcha_id, "variantIndex": 1},
    )
    worker.join(timeout=2)

    assert solve_response.status_code == 200
    assert "response" in result_holder
    response = result_holder["response"]
    assert response.status_code == 200
    body = response.json()
    assert body["variantIndex"] == 1
    assert body["variantTiles"] == ["tile-a"]
    assert body["captcha_id"] == captcha_id
    assert isinstance(body["usage_log_id"], int)


def test_cancel_captcha_by_usage_log_wakes_pending_request(client, api_key, monkeypatch):
    from src import captcha_assembly
    from src.routes import captcha as captcha_route
    from src.services import captcha_file_service
    from src.sse import lock, pending

    pushed = []
    monkeypatch.setattr(
        captcha_route,
        "assemble_captchas",
        lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
    )
    monkeypatch.setattr(captcha_file_service, "ensure_analysis_metadata", lambda data: False)
    monkeypatch.setattr(captcha_route, "push_sse", lambda msg, api_key_id=None: pushed.append((msg, api_key_id)))

    payload = _puzzle_payload(api_key, usage_log_id=404, reservation_id="reservation-cancel")
    captcha_id = captcha_assembly.captcha_hash({"puzzle": payload["puzzle"]})
    result_holder = {}

    worker = threading.Thread(
        target=lambda: result_holder.update(response=client.post("/api/solve-captcha", json=payload))
    )
    worker.start()
    _wait_for_pending(captcha_id)

    cancelled = client.post(
        "/api/cancel-captcha",
        json={"usage_log_id": 404},
    )
    worker.join(timeout=2)

    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert result_holder["response"].status_code == 200
    assert result_holder["response"].json()["status"] == "cancelled"
    with lock:
        assert captcha_id not in pending
    assert any(
        msg["type"] == "captcha_timeout" and msg.get("reason") == "cancelled"
        for msg, _ in pushed
    )


def test_solve_captcha_core_mode_survives_archive_and_metadata_failures(
    client, api_key, monkeypatch
):
    from src import captcha_assembly
    from src.routes import captcha as captcha_route
    from src.services import captcha_file_service

    monkeypatch.setenv("EOPP_PEAK_FAST_MODE", "1")
    monkeypatch.setenv("EOPP_CAPTCHA_SYNC_ARCHIVE_ENABLED", "0")
    monkeypatch.setenv("EOPP_CAPTCHA_SYNC_SOLVER_METADATA_ENABLED", "0")
    monkeypatch.setattr(
        captcha_file_service,
        "ensure_analysis_metadata",
        lambda data: (_ for _ in ()).throw(RuntimeError("metadata should be deferred")),
    )
    monkeypatch.setattr(
        captcha_route,
        "get_top3_from_solver",
        lambda data: (_ for _ in ()).throw(RuntimeError("top3 should be deferred")),
    )
    monkeypatch.setattr(
        captcha_route,
        "assemble_captchas",
        lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
    )

    payload = _puzzle_payload(api_key)
    captcha_id = captcha_assembly.captcha_hash({"puzzle": payload["puzzle"]})
    result_holder = {}

    worker = threading.Thread(
        target=lambda: result_holder.update(response=client.post("/api/solve-captcha", json=payload))
    )
    worker.start()
    _wait_for_pending(captcha_id)

    client.post("/api/solve", json={"captcha_id": captcha_id, "variantIndex": 0})
    worker.join(timeout=2)

    assert result_holder["response"].status_code == 200
    assert result_holder["response"].json()["variantIndex"] == 0


def test_register_usage_core_mode_skips_config_enrichment(
    client, api_key, active_sse, monkeypatch
):
    from src.repositories import company_repo

    monkeypatch.setenv("EOPP_PEAK_FAST_MODE", "1")
    monkeypatch.setattr(
        company_repo,
        "get_or_create_company",
        lambda company: (_ for _ in ()).throw(RuntimeError("company CRM should be deferred")),
    )

    response = client.post(
        "/api/register-usage",
        json={
            "reservation_id": "reservation-core-fast",
            "captcha_id": "captcha-core-fast",
            "config_json": {
                "mode": "create",
                "reservationData": {
                    "raw": {
                        "userData": {
                            "organizationName": "Deferred Company",
                            "fio": "Deferred User",
                        },
                        "vehicleData": [{"subTypeId": 1, "regNumber": "A001AA"}],
                    }
                },
            },
        },
    )

    assert response.status_code == 200
    usage_log_id = response.json()["usage_log_id"]

    from src.repositories import usage_log_repo

    usage = usage_log_repo.get_usage(usage_log_id)
    assert usage is not None
    assert usage.status == "pending"
    assert usage.company is None
    assert usage.company_id is None
    assert usage.fio is None
    assert usage.vehicle_number is None


def test_register_usage_enqueues_after_usage_row_is_committed(
    client, admin_token, monkeypatch
):
    from src.repositories import usage_log_repo
    from src.sse.manager import lock, sse_queues

    user = client.post(
        "/api/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={"name": "Usage Owner", "login": "usage.owner", "password": "strong-password"},
    )
    assert user.status_code == 200
    key = client.post(
        "/api/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "usage-owner-key", "user_id": user.json()["id"]},
    )
    assert key.status_code == 200
    api_key = key.json()["key"]
    api_key_id = key.json()["id"]

    observed = []

    def record_enqueue(name, payload):
        observed.append((name, usage_log_repo.get_usage(payload["usage_log_id"]) is not None))

    monkeypatch.setattr(usage_log_repo, "enqueue_deferred_job", record_enqueue)
    with lock:
        sse_queues.setdefault(api_key_id, []).append(object())

    login = client.post(
        "/api/auth/login",
        json={"login": "usage.owner", "password": "strong-password"},
    )
    assert login.status_code == 200

    response = client.post(
        "/api/register-usage",
        json={
            "reservation_id": "reservation-enqueue-after-commit",
            "captcha_id": "captcha-enqueue-after-commit",
            "config_json": {"mode": "create"},
        },
    )

    assert response.status_code == 200
    assert observed == [("crm.enrich_usage", True)]


def test_confirm_usage_core_mode_survives_billing_captcha_records_and_telegram_failures(
    client, api_key, active_sse, monkeypatch
):
    from src.db import usage_log as db_usage_log
    from src.repositories import usage_log_repo
    from src.services import telegram_service

    monkeypatch.setenv("EOPP_PEAK_FAST_MODE", "1")
    monkeypatch.setenv("EOPP_USAGE_SYNC_BILLING_ENABLED", "0")
    monkeypatch.setenv("EOPP_USAGE_SYNC_CAPTCHA_RECORDS_ENABLED", "0")
    monkeypatch.setattr(
        db_usage_log,
        "deduct_prepaid_for_usage_tx",
        lambda conn, api_key_id, usage_log_id, price: (_ for _ in ()).throw(
            RuntimeError("prepaid should be deferred")
        ),
    )
    monkeypatch.setattr(
        db_usage_log,
        "link_usage_to_open_invoice",
        lambda usage_log_id, company: (_ for _ in ()).throw(
            RuntimeError("invoice should be deferred")
        ),
    )
    monkeypatch.setattr(
        telegram_service,
        "notify_confirmed_usage",
        lambda usage: (_ for _ in ()).throw(RuntimeError("telegram should be deferred")),
    )

    usage_log_id = usage_log_repo.create_usage(
        api_key=api_key,
        reservation_id="reservation-confirm-core",
        captcha_id="captcha-confirm-core",
        config_json={
            "mode": "create",
            "reservationData": {
                "raw": {"userData": {"organizationName": "Billing Deferred"}}
            },
        },
    )

    response = client.post(
        "/api/confirm-usage",
        json={
            "usage_log_id": usage_log_id,
            "slot_date": "2026-06-11T12:00:00+03:00",
            "logs": ["captcha captcha-confirm-core solved"],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    usage = usage_log_repo.get_usage(usage_log_id)
    assert usage is not None
    assert usage.status == "confirmed"
    assert usage.slot_date == "2026-06-11T12:00:00+03:00"
    assert usage.price is None
    assert usage.invoice_id is None
