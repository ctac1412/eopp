def test_health_endpoint_does_not_include_top3_pool_status(client, monkeypatch):
    monkeypatch.setattr(
        "src.routes.health.top3_process_pool.health_status",
        lambda: {
            "status": "degraded",
            "started": False,
            "workers": 4,
            "submitted": 3,
            "succeeded": 2,
            "compute_errors": 1,
            "empty_returns": 1,
            "last_error": "boom",
        },
    )

    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "db": "ok"}


def test_top3_pool_status_endpoint_exposes_pool_status(client, monkeypatch):
    monkeypatch.setattr(
        "src.routes.health.top3_process_pool.health_status",
        lambda: {
            "status": "degraded",
            "started": False,
            "workers": 4,
            "submitted": 3,
            "succeeded": 2,
            "compute_errors": 1,
            "empty_returns": 1,
            "last_error": "boom",
        },
    )

    response = client.get("/api/top3-pool-status")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "started": False,
        "workers": 4,
        "submitted": 3,
        "succeeded": 2,
        "compute_errors": 1,
        "empty_returns": 1,
        "last_error": "boom",
    }


def test_ready_endpoint_does_not_gate_on_top3_pool(client, monkeypatch):
    monkeypatch.setattr(
        "src.routes.health.top3_process_pool.health_status",
        lambda: {
            "status": "degraded",
            "started": False,
            "workers": 4,
            "submitted": 0,
            "succeeded": 0,
            "compute_errors": 1,
            "empty_returns": 1,
            "last_error": "boom",
        },
    )

    response = client.get("/api/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert "top3_pool" not in body["checks"]
    assert "top3_pool" not in body
