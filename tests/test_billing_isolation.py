"""Regression tests proving finance and CRM failures stay outside core flows."""

from __future__ import annotations

import time


def _puzzle_payload(api_key: str) -> dict:
    """Build the smallest manual captcha payload accepted by the HTTP adapter."""

    return {
        "auto_solve": False,
        "timeout_metadata": True,
        "reservation_id": "reservation-billing-isolation",
        "puzzle": {
            "tiles": [{"tileId": "tile-a", "imageData": "a"}],
            "variantsCapture": [["tile-a"], ["tile-a"]],
        },
    }


def _wait_for_pending(captcha_id: str, timeout: float = 2.0) -> None:
    """Wait until a manual captcha reaches the in-memory pending store."""

    from src.sse import lock, pending

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with lock:
            if captcha_id in pending:
                return
        time.sleep(0.01)
    raise AssertionError(f"captcha {captcha_id} did not enter pending store")


def test_broken_tariff_does_not_break_captcha_solve(client, api_key, monkeypatch):
    """A broken tariff repository must not affect captcha receive/api/solve."""

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
    monkeypatch.setattr(
        "src.db.tariffs.get_effective_tariff",
        lambda api_key_id: (_ for _ in ()).throw(RuntimeError("tariffs are down")),
    )

    monkeypatch.setattr(captcha_route, "solve_captcha", lambda data: (1, ["tile-a"], []))

    payload = _puzzle_payload(api_key)
    payload["auto_solve"] = True
    captcha_id = captcha_assembly.captcha_hash({"puzzle": payload["puzzle"]})

    response = client.post("/api/solve-captcha", json=payload)

    assert response.status_code == 200
    assert response.json()["variantIndex"] == 1
    assert response.json()["variantTiles"] == ["tile-a"]
    assert response.json()["captcha_id"] == captcha_id


def test_broken_invoice_link_does_not_break_confirm_core(
    client, api_key, active_sse, monkeypatch
):
    """Invoice linking failure must be isolated behind billing jobs."""

    from src.repositories import usage_log_repo

    monkeypatch.setattr(
        "src.db.invoices.link_usage_to_open_invoice",
        lambda usage_log_id, company: (_ for _ in ()).throw(RuntimeError("invoice db is down")),
    )

    usage_log_id = usage_log_repo.create_usage(
        api_key=api_key,
        reservation_id="reservation-invoice-isolation",
        captcha_id="captcha-invoice-isolation",
        config_json={
            "mode": "create",
            "reservationData": {
                "raw": {"userData": {"organizationName": "Invoice Isolation LLC"}}
            },
        },
    )

    response = client.post(
        "/api/confirm-usage",
            json={
                "usage_log_id": usage_log_id,
                "slot_date": "2026-06-11T12:00:00+03:00",
                "logs": ["captcha solved"],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    usage = usage_log_repo.get_usage(usage_log_id)
    assert usage is not None
    assert usage.status == "confirmed"
    assert usage.invoice_id is None


def test_broken_company_parsing_does_not_break_register_core(
    client, api_key, active_sse, monkeypatch
):
    """CRM parsing/enrichment failure must not block minimal usage registration."""

    monkeypatch.setattr(
        "src.db.usage_log.normalize_company",
        lambda company: (_ for _ in ()).throw(RuntimeError("company aliases are down")),
    )

    response = client.post(
        "/api/register-usage",
        json={
            "reservation_id": "reservation-crm-isolation",
            "captcha_id": "captcha-crm-isolation",
            "config_json": {
                "mode": "create",
                "reservationData": {
                    "raw": {
                        "userData": {
                            "organizationName": "CRM Isolation LLC",
                            "fio": "CRM User",
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
    assert usage.fio is None
    assert usage.vehicle_number is None
