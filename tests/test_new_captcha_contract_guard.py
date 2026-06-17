from pathlib import Path


def test_backend_new_captcha_payloads_go_through_display_builder():
    root = Path("server/src")
    offenders = []
    for path in root.rglob("*.py"):
        if path.as_posix() == "server/src/core/captcha_runtime/display_payload.py":
            continue
        text = path.read_text(encoding="utf-8")
        if '"type": "new_captcha"' in text or "'type': 'new_captcha'" in text:
            offenders.append(path.as_posix())

    assert offenders == []
