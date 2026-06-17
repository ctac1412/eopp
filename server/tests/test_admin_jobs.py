def test_admin_jobs_requires_admin(client):
    response = client.get("/api/admin/jobs")

    assert response.status_code == 401


def test_admin_jobs_overview_lists_queue_counts(client, admin_token):
    from src.platform.jobs.queue import enqueue_deferred_job

    job = enqueue_deferred_job("crm.enrich_usage", {"usage_log_id": 589})

    response = client.get("/api/admin/jobs", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    data = response.json()
    assert data["db_path"]
    assert any(
        item["status"] == "pending"
        and item["name"] == "crm.enrich_usage"
        and item["count"] == 1
        for item in data["jobs_by_status"]
    )
    listed = next(item for item in data["jobs"] if item["id"] == job.id)
    assert listed["payload"] == {"usage_log_id": 589}
    assert data["oldest_due_job"]["id"] == job.id


def test_admin_job_detail_returns_parsed_payload(client, admin_token):
    from src.platform.jobs.queue import enqueue_deferred_job

    job = enqueue_deferred_job("billing.calculate_usage_price", {"usage_log_id": 42})

    response = client.get(f"/api/admin/jobs/{job.id}", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    data = response.json()
    assert data["job_name"] == "billing.calculate_usage_price"
    assert data["payload"] == {"usage_log_id": 42}


def test_admin_run_jobs_drains_due_jobs(client, admin_token):
    from src.platform.jobs.queue import enqueue_deferred_job

    enqueue_deferred_job("unknown.admin_test_job", {"value": 1})

    response = client.post(
        "/api/admin/jobs/run",
        headers={"X-Admin-Token": admin_token},
        json={"max_jobs": 10},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["processed"] == 1
    assert data["missing_handler"] == 1
    assert data["dead_lettered"] == 1


def test_admin_requeue_usage_allows_known_usage_jobs(client, admin_token):
    response = client.post(
        "/api/admin/jobs/requeue-usage",
        headers={"X-Admin-Token": admin_token},
        json={"usage_log_id": 589, "jobs": ["crm.enrich_usage", "billing.calculate_usage_price"]},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["usage_log_id"] == 589
    assert [job["job_name"] for job in data["jobs"]] == [
        "crm.enrich_usage",
        "billing.calculate_usage_price",
    ]


def test_admin_requeue_usage_rejects_unknown_jobs(client, admin_token):
    response = client.post(
        "/api/admin/jobs/requeue-usage",
        headers={"X-Admin-Token": admin_token},
        json={"usage_log_id": 589, "jobs": ["danger.clear_all"]},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "unsupported_job"
