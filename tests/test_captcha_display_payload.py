import threading


def test_new_captcha_message_uses_raw_tiles_for_puzzle_payload():
    from src.core.captcha_runtime.display_payload import build_new_captcha_message
    from src.core.captcha_runtime.sessions import CaptchaSession

    session = CaptchaSession(
        captcha_id="puzzle",
        variants=[["tile-a"], ["tile-b"]],
        images={},
        usage_log_id=1,
        api_key_id=2,
        tiles=[{"tileId": "tile-a", "imageData": "jpeg-a"}],
        valid_index=1,
    )

    message = build_new_captcha_message(
        session,
        top3=["1"],
        confident=True,
        created_at=123.0,
        timeout=30,
        owner_label="master",
        owner_api_key_id=2,
    )

    assert message.to_dict() == {
        "type": "new_captcha",
        "captcha_id": "puzzle",
        "images": {},
        "tiles": [{"tileId": "tile-a", "imageData": "jpeg-a"}],
        "variants": [["tile-a"], ["tile-b"]],
        "count": 2,
        "top3": ["1"],
        "confident": True,
        "created_at": 123.0,
        "timeout": 30,
        "owner_label": "master",
        "owner_api_key_id": 2,
    }


def test_captcha_display_fields_can_be_reused_by_http_training_payloads():
    from src.core.captcha_runtime.display_payload import build_captcha_display_fields

    fields = build_captcha_display_fields(
        {
            "images": {},
            "tiles": [{"tileId": "tile-a", "imageData": "jpeg-a"}],
            "variants": [["tile-a"], ["tile-a"]],
        }
    )

    assert fields.to_dict() == {
        "images": {},
        "tiles": [{"tileId": "tile-a", "imageData": "jpeg-a"}],
        "variants": [["tile-a"], ["tile-a"]],
        "count": 2,
    }


def test_new_captcha_message_keeps_icon_click_image_fields():
    from src.core.captcha_runtime.display_payload import build_new_captcha_message
    from src.core.captcha_runtime.sessions import CaptchaSession

    session = CaptchaSession(
        captcha_id="icon",
        variants=[],
        images={"0": "main-image"},
        usage_log_id=1,
        api_key_id=2,
        captcha_type=1,
        icons_image="icons",
        distribution={"operator_id": 0},
    )

    message = build_new_captcha_message(
        session,
        created_at=123.0,
        timeout=30,
        owner_label="master",
        owner_api_key_id=2,
    )

    assert message.to_dict()["images"] == {"0": "main-image"}
    assert message.to_dict()["tiles"] == []
    assert message.to_dict()["variants"] == []
    assert message.to_dict()["count"] == 1
    assert message.to_dict()["captcha_type"] == 1
    assert message.to_dict()["icons_image"] == "icons"
    assert message.to_dict()["distribution"] == {"operator_id": 0}


def test_new_captcha_message_accepts_legacy_pending_mapping():
    from src.core.captcha_runtime.display_payload import build_new_captcha_message

    event = threading.Event()
    entry = {
        "captcha_id": "mapped",
        "images": {},
        "tiles": [{"tileId": "tile-a", "imageData": "jpeg-a"}],
        "variants": [["tile-a"]],
        "event": event,
        "result": None,
        "api_key_id": 2,
        "usage_log_id": 1,
    }

    message = build_new_captcha_message(
        entry,
        created_at=123.0,
        timeout=30,
        owner_label="master",
        owner_api_key_id=2,
    )

    assert message.to_dict()["captcha_id"] == "mapped"
    assert message.to_dict()["images"] == {}
    assert message.to_dict()["tiles"] == [{"tileId": "tile-a", "imageData": "jpeg-a"}]
    assert message.to_dict()["variants"] == [["tile-a"]]
    assert message.to_dict()["count"] == 1
