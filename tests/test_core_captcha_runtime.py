"""Regression tests for the protected captcha runtime boundary."""

import ast
import asyncio
import importlib
import inspect
import threading


def test_session_store_detects_duplicates_and_cleans_up():
    from src.core.captcha_runtime.sessions import CaptchaSession, CaptchaSessionStore

    store = CaptchaSessionStore()
    first = CaptchaSession(
        captcha_id="captcha-1",
        variants=[["a"], ["b"]],
        images={"0": "image-0", "1": "image-1"},
        usage_log_id=42,
        api_key_id=7,
    )
    duplicate = CaptchaSession(
        captcha_id="captcha-1",
        variants=[],
        images={},
        usage_log_id=99,
        api_key_id=8,
    )

    stored, is_duplicate = store.add_or_get(first)
    duplicate_stored, duplicate_flag = store.add_or_get(duplicate)

    assert stored is first
    assert is_duplicate is False
    assert duplicate_stored is first
    assert duplicate_flag is True

    assert store.set_result("captcha-1", {"variantIndex": 1}) is first
    assert first.result == {"variantIndex": 1}
    assert first.event.is_set()
    assert store.pop("captcha-1") is first
    assert store.get("captcha-1") is None


def test_session_store_waits_for_solution_in_thread():
    from src.core.captcha_runtime.sessions import CaptchaSession, CaptchaSessionStore

    store = CaptchaSessionStore()
    session = CaptchaSession(
        captcha_id="captcha-2",
        variants=[["a"]],
        images={"0": "image-0"},
        usage_log_id=5,
        api_key_id=3,
    )
    store.add_or_get(session)

    def solve_later():
        store.set_result("captcha-2", {"variantIndex": 0})

    thread = threading.Thread(target=solve_later)
    thread.start()
    thread.join(timeout=1)

    assert session.wait(timeout=1)
    assert session.result == {"variantIndex": 0}


async def _run_runtime_manual_flow():
    from src.core.captcha_runtime.runtime import CaptchaRuntime, CaptchaRuntimeDependencies
    from src.core.captcha_runtime.sessions import CaptchaSessionStore

    published = []
    events = []

    class KeyRecord:
        id = 11

    async def publish_event(event):
        events.append(event)

    deps = CaptchaRuntimeDependencies(
        validate_api_key=lambda api_key: KeyRecord(),
        get_or_create_usage_log=lambda usage_log_id, api_key, reservation_id, captcha_id: 77,
        save_captcha_payload=lambda captcha_id, data: data,
        captcha_hash=lambda data: "captcha-runtime",
        assemble_captchas=lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
        push_sse=lambda message, api_key_id=None: published.append((message, api_key_id)),
        get_owner_label=lambda api_key_id: "owner",
        next_result_id=lambda: 123,
        publish_event=publish_event,
        captcha_timeout=1,
    )
    runtime = CaptchaRuntime(deps, CaptchaSessionStore())

    payload = {
        "api_key": "secret",
        "auto_solve": False,
        "timeout_metadata": True,
        "reservation_id": "reservation-1",
        "puzzle": {
            "tiles": [{"tileId": "a", "imageData": "a"}],
            "variantsCapture": [["a"], ["a"]],
        },
    }

    pending_task = asyncio.create_task(runtime.handle_captcha(payload))
    for _ in range(100):
        if runtime.sessions.get("captcha-runtime") is not None:
            break
        await asyncio.sleep(0.01)

    solve_response = await runtime.submit_solution(
        {"captcha_id": "captcha-runtime", "variantIndex": 1, "api_key": "secret"}
    )
    solve_status, solve_body = solve_response
    handle_status, handle_body = await pending_task

    return solve_status, solve_body, handle_status, handle_body, published, events


async def _run_runtime_test_no_timeout_display_flow():
    from src.core.captcha_runtime.runtime import CaptchaRuntime, CaptchaRuntimeDependencies
    from src.core.captcha_runtime.sessions import CaptchaSessionStore

    published = []

    class KeyRecord:
        id = 11

    deps = CaptchaRuntimeDependencies(
        validate_api_key=lambda api_key: KeyRecord(),
        get_or_create_usage_log=lambda usage_log_id, api_key, reservation_id, captcha_id: 77,
        save_captcha_payload=lambda captcha_id, data: data,
        captcha_hash=lambda data: "captcha-test-no-timeout",
        assemble_captchas=lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
        push_sse=lambda message, api_key_id=None: published.append((message, api_key_id)),
        get_owner_label=lambda api_key_id: "owner",
        next_result_id=lambda: 123,
        publish_event=lambda event: None,
        captcha_timeout=1,
    )
    runtime = CaptchaRuntime(deps, CaptchaSessionStore())

    payload = {
        "api_key": "secret",
        "auto_solve": False,
        "timeout_metadata": True,
        "test_no_timeout": True,
        "reservation_id": "reservation-1",
        "puzzle": {
            "tiles": [{"tileId": "a", "imageData": "a"}],
            "variantsCapture": [["a"], ["a"]],
        },
    }

    pending_task = asyncio.create_task(runtime.handle_captcha(payload))
    for _ in range(100):
        if runtime.sessions.get("captcha-test-no-timeout") is not None:
            break
        await asyncio.sleep(0.01)

    await runtime.submit_solution(
        {"captcha_id": "captcha-test-no-timeout", "variantIndex": 1, "api_key": "secret"}
    )
    await pending_task
    return published


def test_runtime_handles_manual_captcha_flow():
    solve_status, solve_body, handle_status, handle_body, published, events = asyncio.run(
        _run_runtime_manual_flow()
    )

    assert solve_status == 200
    assert solve_body["variantIndex"] == 1
    assert solve_body["variantTiles"] == ["a"]
    assert solve_body["resultFile"] == "captcha_captcha-runtime_0123.json"
    assert handle_status == 200
    assert handle_body["variantIndex"] == 1
    assert handle_body["usage_log_id"] == 77
    assert handle_body["captcha_id"] == "captcha-runtime"
    assert published[0][0]["type"] == "new_captcha"
    assert published[-1][0]["type"] == "captcha_solved"
    assert [event.__class__.__name__ for event in events] == [
        "CaptchaReceived",
        "CaptchaDisplayed",
        "CaptchaSolved",
    ]


def test_runtime_publishes_effective_test_no_timeout_to_frontend():
    published = asyncio.run(_run_runtime_test_no_timeout_display_flow())

    new_captcha = next(message for message, _ in published if message["type"] == "new_captcha")
    assert new_captcha["timeout"] == 3600


async def _run_runtime_cancel_flow():
    from src.core.captcha_runtime.runtime import CaptchaRuntime, CaptchaRuntimeDependencies
    from src.core.captcha_runtime.sessions import CaptchaSessionStore

    published = []

    class KeyRecord:
        id = 22

    deps = CaptchaRuntimeDependencies(
        validate_api_key=lambda api_key: KeyRecord(),
        get_or_create_usage_log=lambda usage_log_id, api_key, reservation_id, captcha_id: 88,
        save_captcha_payload=lambda captcha_id, data: data,
        captcha_hash=lambda data: "captcha-cancel",
        assemble_captchas=lambda tiles, variants, valid_index: [
            {"index": index, "image": f"image-{index}"} for index, _ in enumerate(variants)
        ],
        push_sse=lambda message, api_key_id=None: published.append((message, api_key_id)),
        get_owner_label=lambda api_key_id: "owner",
        next_result_id=lambda: 123,
        publish_event=lambda event: None,
        captcha_timeout=30,
    )
    runtime = CaptchaRuntime(deps, CaptchaSessionStore())
    payload = {
        "api_key": "secret",
        "auto_solve": False,
        "timeout_metadata": True,
        "reservation_id": "reservation-1",
        "usage_log_id": 88,
        "puzzle": {
            "tiles": [{"tileId": "a", "imageData": "a"}],
            "variantsCapture": [["a"], ["a"]],
        },
    }

    pending_task = asyncio.create_task(runtime.handle_captcha(payload))
    for _ in range(100):
        if runtime.sessions.get("captcha-cancel") is not None:
            break
        await asyncio.sleep(0.01)

    cancel_status, cancel_body = await runtime.cancel_captcha({"usage_log_id": 88, "api_key": "secret"})
    handle_status, handle_body = await pending_task
    return cancel_status, cancel_body, handle_status, handle_body, published, runtime.sessions.count()


def test_runtime_cancel_by_usage_log_notifies_frontend_and_clears_pending():
    cancel_status, cancel_body, handle_status, handle_body, published, pending_count = asyncio.run(
        _run_runtime_cancel_flow()
    )

    assert cancel_status == 200
    assert cancel_body == {"ok": True, "captcha_id": "captcha-cancel", "status": "cancelled"}
    assert handle_status == 200
    assert handle_body["status"] == "cancelled"
    assert handle_body["error"] == "captcha_cancelled"
    assert pending_count == 0
    timeout_events = [item for item in published if item[0]["type"] == "captcha_timeout"]
    assert timeout_events[-1] == (
        {
            "type": "captcha_timeout",
            "captcha_id": "captcha-cancel",
            "owner_label": "owner",
            "owner_api_key_id": 22,
            "reason": "cancelled",
            "owner_notified": True,
        },
        22,
    )


def test_core_captcha_runtime_imports_no_forbidden_side_modules():
    forbidden = (
        "billing",
        "crm",
        "training",
        "plugins",
        "admin",
        "telegram",
        "invoice",
        "prepaid",
    )
    module_names = [
        "src.core.contracts.events",
        "src.core.captcha_runtime.sessions",
        "src.core.captcha_runtime.presenter",
        "src.core.captcha_runtime.runtime",
    ]

    for module_name in module_names:
        module = importlib.import_module(module_name)
        tree = ast.parse(inspect.getsource(module))
        imported_names = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_names.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imported_names.append(node.module or "")
        for name in forbidden:
            assert not any(name in imported for imported in imported_names)
