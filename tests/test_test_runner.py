import json


def test_test_runner_posts_captchas_to_api_prefixed_solve_route(monkeypatch):
    import src.db  # noqa: F401
    from src import test_runner

    calls = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        calls.append((path, json.loads(body), http_timeout))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(test_runner, "_http_post", fake_http_post)

    test_runner._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
    )

    assert calls[0][0] == "/api/solve-captcha"


def test_test_runner_forwards_session_cookie_to_internal_solve_call(monkeypatch):
    import src.db  # noqa: F401
    from src import test_runner

    calls = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        calls.append((path, extra_headers or {}))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(test_runner, "_http_post", fake_http_post)

    test_runner._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
        session_token="session-token",
    )

    assert calls[0][1]["Cookie"] == "eopp_session=session-token"


def test_test_runner_lets_api_route_inject_session_api_key(monkeypatch):
    import src.db  # noqa: F401
    from src import test_runner

    bodies = []

    def fake_http_post(path, body, extra_headers=None, http_timeout=15):
        bodies.append(json.loads(body))

        class Response:
            status = 200

        return Response()

    monkeypatch.setattr(test_runner, "_http_post", fake_http_post)

    test_runner._send_captcha_with_reservation(
        json.dumps({"puzzle": {"tiles": [], "variantsCapture": []}}),
        api_key="test-key",
        reservation_id="reservation-1",
        session_token="session-token",
    )

    assert "api_key" not in bodies[0]
