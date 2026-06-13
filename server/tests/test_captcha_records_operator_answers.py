def test_captcha_records_include_operator_answers(monkeypatch):
    from src.entities import CaptchaRecord
    from src.repositories import captcha_repo, distribution_repo
    from src.services import captcha_records_service

    record = CaptchaRecord(
        id=1,
        captcha_id="cap-1",
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
            "cap-1": [
                {
                    "operator_id": 7,
                    "operator_nickname": "Оператор 7",
                    "icon_position": 2,
                    "x": 120,
                    "y": 80,
                    "duration_ms": 450,
                    "created_at": "2026-06-13T10:00:01+00:00",
                }
            ]
        },
        raising=False,
    )

    status, content = captcha_records_service.list_records("session", usage_log_id=42)

    assert status == 200
    assert content[0]["operator_names"] == ["Оператор 7"]
    assert content[0]["operator_answers"][0]["icon_position"] == 2
