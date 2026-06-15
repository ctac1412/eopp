def test_captcha_records_filter_operator_answers_by_usage_log(monkeypatch):
    from src.entities import CaptchaRecord
    from src.repositories import captcha_repo, distribution_repo
    from src.services import captcha_records_service

    record = CaptchaRecord(
        id=1,
        captcha_id="cap-reused",
        status="passed",
        usage_log_id=42,
        created_at="2026-06-13T10:00:00+00:00",
        duration_ms=1200,
    )

    monkeypatch.setattr(captcha_records_service, "is_admin_token", lambda token: True)
    monkeypatch.setattr(captcha_repo, "list_records", lambda usage_log_id=None: [record])
    monkeypatch.setattr(
        distribution_repo,
        "get_answers_for_captcha_ids",
        lambda captcha_ids: {
            "cap-reused": [
                {
                    "usage_log_id": 41,
                    "operator_id": 1,
                    "operator_nickname": "old",
                    "icon_position": 0,
                    "x": 1,
                    "y": 1,
                },
                {
                    "usage_log_id": 42,
                    "operator_id": 2,
                    "operator_nickname": "current",
                    "icon_position": 4,
                    "x": 100,
                    "y": 100,
                },
            ]
        },
        raising=False,
    )

    status, content = captcha_records_service.list_records("session", usage_log_id=42)

    assert status == 200
    assert content[0]["operator_names"] == ["current (1)"]
    assert [answer["icon_position"] for answer in content[0]["operator_answers"]] == [4]


def test_captcha_records_fallback_to_executor_clicks(monkeypatch):
    from src.entities import CaptchaRecord
    from src.repositories import captcha_repo, distribution_repo
    from src.services import captcha_records_service

    record = CaptchaRecord(
        id=1,
        captcha_id="cap-with-executor-clicks",
        status="passed",
        usage_log_id=77,
        created_at="2026-06-13T10:00:00+00:00",
        duration_ms=900,
    )

    monkeypatch.setattr(captcha_records_service, "is_admin_token", lambda token: True)
    monkeypatch.setattr(captcha_repo, "list_records", lambda usage_log_id=None: [record])
    monkeypatch.setattr(distribution_repo, "get_answers_for_captcha_ids", lambda captcha_ids: {}, raising=False)
    monkeypatch.setattr(
        captcha_records_service,
        "_payload_coordinates",
        lambda captcha_id: [{"x": 12, "y": 34}, {"x": 56, "y": 78}],
    )

    status, content = captcha_records_service.list_records("session", usage_log_id=77)

    assert status == 200
    assert content[0]["operator_names"] == ["Исполнитель (2)"]
    assert [
        (answer["operator_nickname"], answer["icon_position"], answer["x"], answer["y"])
        for answer in content[0]["operator_answers"]
    ] == [
        ("Исполнитель", 0, 12, 34),
        ("Исполнитель", 1, 56, 78),
    ]
