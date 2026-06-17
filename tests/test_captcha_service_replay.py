import threading


def test_replay_captchas_pushes_raw_puzzle_payload(monkeypatch):
    import src.db  # noqa: F401
    from src.services import captcha_service

    payload = {
        "puzzle": {
            "tiles": [{"tileId": "tile-a", "imageData": "jpeg-a"}],
            "variantsCapture": [["tile-a"], ["tile-a"]],
        }
    }
    published = []
    pushed = threading.Event()

    monkeypatch.setattr(captcha_service, "get_connected_streams", lambda: ["operator"])
    monkeypatch.setattr(captcha_service, "load_captcha_file", lambda captcha_id: payload)
    monkeypatch.setattr(captcha_service.time, "sleep", lambda seconds: None)

    def push_sse(message, api_key_id=None):
        published.append((message, api_key_id))
        pushed.set()

    monkeypatch.setattr(captcha_service, "push_sse", push_sse)

    assert captcha_service.replay_captchas(["captcha-raw"]) == 1
    assert pushed.wait(1)

    message, api_key_id = published[0]
    assert api_key_id is None
    assert message["type"] == "new_captcha"
    assert message["captcha_id"] == "captcha-raw"
    assert message["images"] == {}
    assert message["tiles"] == [{"tileId": "tile-a", "imageData": "jpeg-a"}]
    assert message["variants"] == [["tile-a"], ["tile-a"]]
    assert message["count"] == 2
