from src.core.captcha_runtime.sessions import CaptchaSession
from src.routes.sse import _pending_snapshot_events


def test_pending_snapshot_messages_restore_current_master_captchas():
    pending = {
        "own": CaptchaSession(
            captcha_id="own",
            variants=[["a"], ["b"]],
            images={"0": "image-0", "1": "image-1"},
            usage_log_id=10,
            api_key_id=7,
        ),
        "other": CaptchaSession(
            captcha_id="other",
            variants=[["x"]],
            images={"0": "image-x"},
            usage_log_id=11,
            api_key_id=8,
        ),
    }

    messages = _pending_snapshot_events(
        pending,
        {},
        api_key_id=7,
        owner_label="master",
        timeout=10,
        now=123.0,
    )

    assert messages == [
        {
            "type": "new_captcha",
            "captcha_id": "own",
            "images": {"0": "image-0", "1": "image-1"},
            "count": 2,
            "top3": [],
            "confident": False,
            "created_at": 123.0,
            "timeout": 10,
            "owner_label": "master",
            "owner_api_key_id": 7,
        }
    ]


def test_pending_snapshot_messages_keep_icon_distribution_fields():
    session = CaptchaSession(
        captcha_id="icon",
        variants=[],
        images={"0": "main"},
        usage_log_id=12,
        api_key_id=7,
        captcha_type=1,
        icons_image="icon-image",
        distribution={"operator_id": 0, "assigned": [1, 2], "num_operators": 2},
        icons_cache={1: {"icon": "one"}},
    )

    messages = _pending_snapshot_events(
        {"icon": session},
        {},
        api_key_id=7,
        owner_label="master",
        timeout=10,
        now=123.0,
    )

    assert messages[0]["captcha_type"] == 1
    assert messages[0]["icons_image"] == "icon-image"
    assert messages[0]["distribution"] == {"operator_id": 0, "assigned": [1, 2], "num_operators": 2}


def test_pending_snapshot_events_restore_distribution_progress():
    session = CaptchaSession(
        captcha_id="icon",
        variants=[],
        images={"0": "main"},
        usage_log_id=12,
        api_key_id=7,
        captcha_type=1,
        icons_image="icon-image",
        distribution={"operator_id": 0, "assigned": [1, 2], "num_operators": 2},
    )
    distribution_states = {
        "icon": {
            "api_key_id": 7,
            "total_icons": 5,
            "all_answers": {
                1: {"x": 10, "y": 20, "operator_id": 0},
                3: {"x": 30, "y": 40, "operator_id": 2},
            },
        }
    }

    messages = _pending_snapshot_events(
        {"icon": session},
        distribution_states,
        api_key_id=7,
        owner_label="master",
        timeout=10,
        now=123.0,
    )

    assert messages[1] == {
        "type": "distribution_progress",
        "captcha_id": "icon",
        "solved_count": 2,
        "total_icons": 5,
        "answered_positions": [1, 3],
        "all_coords": {
            1: {"x": 10, "y": 20, "operator_id": 0},
            3: {"x": 30, "y": 40, "operator_id": 2},
        },
    }
