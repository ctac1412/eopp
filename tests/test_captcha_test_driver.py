import json


def test_captcha_test_driver_posts_captchas_to_api_prefixed_solve_route(monkeypatch):
    import src.db  # noqa: F401
    from src import captcha_test_driver

    calls = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        calls.append((path, json.loads(body), http_timeout))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(captcha_test_driver, "_http_post", fake_http_post)

    captcha_test_driver._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
    )

    assert calls[0][0] == "/api/solve-captcha"


def test_captcha_test_driver_forwards_session_cookie_to_internal_solve_call(monkeypatch):
    import src.db  # noqa: F401
    from src import captcha_test_driver

    calls = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        calls.append((path, extra_headers or {}))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(captcha_test_driver, "_http_post", fake_http_post)

    captcha_test_driver._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
        session_token="session-token",
    )

    assert calls[0][1]["Cookie"] == "eopp_session=session-token"


def test_captcha_test_driver_lets_api_route_inject_session_api_key(monkeypatch):
    import src.db  # noqa: F401
    from src import captcha_test_driver

    bodies = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        bodies.append(json.loads(body))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(captcha_test_driver, "_http_post", fake_http_post)

    captcha_test_driver._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
        session_token="session-token",
    )

    assert "api_key" not in bodies[0]


def test_replay_captchas_posts_to_solve_with_session_and_rucaptcha(monkeypatch):
    import src.db  # noqa: F401
    from src.services import captcha_service

    calls = []

    monkeypatch.setattr(captcha_service, "get_connected_streams", lambda: [{"api_key_id": 1}])
    monkeypatch.setattr(
        captcha_service,
        "load_captcha_file",
        lambda captcha_id: {"puzzle": {"tiles": [], "variantsCapture": []}},
    )
    monkeypatch.setattr(captcha_service.time, "sleep", lambda _seconds: None)

    class Thread:
        def __init__(self, target, daemon=False):
            self.target = target
            self.daemon = daemon

        def start(self):
            self.target()

    monkeypatch.setattr(captcha_service.threading, "Thread", Thread)

    def fake_send(body, **kwargs):
        calls.append((json.loads(body), kwargs))

    monkeypatch.setattr(captcha_service, "_send_replay_payload", fake_send)

    sent = captcha_service.replay_captchas(
        ["cap-1"],
        session_token="session-token",
        auto_solve_rucaptcha=True,
    )

    assert sent == 1
    assert calls == [
        (
            {"puzzle": {"tiles": [], "variantsCapture": []}},
            {
                "session_token": "session-token",
                "auto_solve_rucaptcha": True,
            },
        )
    ]
