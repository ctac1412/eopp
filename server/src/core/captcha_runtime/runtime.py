"""Protected captcha runtime used by HTTP adapters."""

from __future__ import annotations

import asyncio
import inspect
import threading
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from src.captcha_assembly import (
    get_solver_answer_from_metadata,
    get_top3_from_solver,
    is_icon_click_type,
)
from src.core.contracts.events import (
    CaptchaDisplayed,
    CaptchaReceived,
    CaptchaSolved,
    CaptchaTimedOut,
)
from src.platform.observability.metrics import gauge_set, histogram_observe

from .presenter import CaptchaPresenter
from .sessions import CaptchaSession, CaptchaSessionStore

EventPublisher = Callable[[Any], Awaitable[None] | None]


async def _noop_event_publisher(event: Any) -> None:
    """Default event publisher used when an adapter has no event bus yet."""

    return None


@dataclass
class CaptchaRuntimeDependencies:
    """Adapter-provided functions required by the protected captcha runtime.

    Core code owns the solve flow, duplicate handling, timeouts, and result
    setting. Storage, SSE delivery, API-key validation, operator-specific icon
    preparation, and background-job enqueueing stay injected to keep side
    modules out of ``server.src.core`` imports.
    """

    validate_api_key: Callable[[str], Any]
    get_or_create_usage_log: Callable[[int | None, str, str, str], int]
    save_captcha_payload: Callable[[str, dict[str, Any]], Any]
    captcha_hash: Callable[[dict[str, Any]], str]
    assemble_captchas: Callable[[list, list, int | None], list[dict[str, Any]]]
    push_sse: Callable[[dict[str, Any], int | None], None]
    get_owner_label: Callable[[int | None], str]
    next_result_id: Callable[[], int]
    captcha_timeout: int | float
    get_key_record: Callable[[str], dict[str, Any] | None] | None = None
    verify_usage_log_matches_captcha: Callable[[int, str], bool] | None = None
    get_super_subscriptions: Callable[[int], set[int] | None] | None = None
    prepare_icon_session: Callable[..., Awaitable[Any]] | None = None
    on_timeout: Callable[[str, int | None, int | None, dict[str, Any]], Awaitable[None] | None] | None = None
    auto_solve: Callable[[dict[str, Any]], Any] | None = None
    get_top3: Callable[[dict[str, Any]], list[str]] = get_top3_from_solver
    sync_solver_metadata: Callable[[], bool] = lambda: True
    enqueue_metadata: Callable[[str, str], None] = lambda captcha_id, reason: None
    publish_event: EventPublisher = _noop_event_publisher
    log_step: Callable[..., None] = lambda *args, **kwargs: None


class CaptchaRuntime:
    """Protected captcha flow used by the thin FastAPI route adapter."""

    def __init__(
        self,
        dependencies: CaptchaRuntimeDependencies,
        sessions: CaptchaSessionStore | None = None,
        presenter: CaptchaPresenter | None = None,
    ) -> None:
        self.dependencies = dependencies
        self.sessions = sessions if sessions is not None else CaptchaSessionStore()
        self.presenter = presenter if presenter is not None else CaptchaPresenter(
            assemble_puzzle=dependencies.assemble_captchas,
            prepare_icon_session=dependencies.prepare_icon_session,
        )

    async def handle_captcha(self, request: Any) -> tuple[int, dict[str, Any] | None]:
        """Handle the ``/solve-captcha`` business flow.

        The method validates access, creates or reuses usage state, persists the
        payload through an injected adapter, optionally auto-solves, publishes a
        human-facing captcha display event, waits for a manual solution, and
        returns the legacy HTTP response payload.
        """

        request_start = time.perf_counter()
        body = _to_payload(request)
        api_key = body.get("api_key")
        auto = bool(body.get("auto_solve", False))
        captcha_id = None
        rid = f"usage:{body.get('usage_log_id')}" if body.get("usage_log_id") else "usage:new"

        key_record = self.dependencies.validate_api_key(api_key)
        if isinstance(key_record, tuple):
            status, content = key_record
            self._log(rid, captcha_id, "validate_api_key", request_start, status=status)
            return status, content
        api_key_id = _get_value(key_record, "id")

        data = _captcha_payload(body)
        captcha_id = self.dependencies.captcha_hash(data)
        usage_log_id = self.dependencies.get_or_create_usage_log(
            body.get("usage_log_id"),
            api_key,
            body.get("reservation_id") or "unknown",
            captcha_id,
        )
        rid = f"usage:{usage_log_id}"
        await self._publish(CaptchaReceived(captcha_id, usage_log_id, api_key_id))

        if auto and not is_icon_click_type(data):
            saved = self.dependencies.save_captcha_payload(captcha_id, data)
            data = _saved_data(saved, data)
            solver_answer = get_solver_answer_from_metadata(data)
            if solver_answer is None:
                if self.dependencies.auto_solve is None:
                    return 500, {"error": "auto solve unavailable"}
                best_variant, tile_order, _results = await asyncio.to_thread(
                    self.dependencies.auto_solve, data
                )
            else:
                best_variant, tile_order, _results = solver_answer
            self._log(rid, captcha_id, "finish", request_start, mode="auto", status="success")
            histogram_observe("captcha_solve_duration_ms", (time.perf_counter() - request_start) * 1000, mode="auto")
            return 200, {
                "variantIndex": best_variant,
                "variantTiles": tile_order,
                "usage_log_id": usage_log_id,
                "captcha_id": captcha_id,
            }

        event = threading.Event()
        presentation = await self.presenter.build(
            captcha_id=captcha_id,
            data=data,
            usage_log_id=usage_log_id,
            api_key_id=api_key_id,
            event=event,
            auto_solve_rucaptcha=bool(body.get("auto_solve_rucaptcha", False)),
        )
        session, is_duplicate = self.sessions.add_or_get(presentation.session)
        gauge_set("captcha_pending_count", self.sessions.count())
        saved = self.dependencies.save_captcha_payload(captcha_id, data)
        data = _saved_data(saved, data)
        top3, confident = self._top3(data, captcha_id)
        await self._publish(
            CaptchaDisplayed(
                captcha_id=captcha_id,
                usage_log_id=usage_log_id,
                api_key_id=api_key_id,
                images_count=len(session.images),
                top3=top3,
                is_duplicate=is_duplicate,
            )
        )

        if is_duplicate:
            result = await self._wait_duplicate(session, body, captcha_id, usage_log_id)
            return 200, result

        owner_label = self.dependencies.get_owner_label(api_key_id)
        self._push_display(
            session=session,
            data=data,
            top3=top3,
            confident=confident,
            owner_label=owner_label,
            is_distributed=presentation.is_distributed,
            metadata=presentation.metadata,
        )
        histogram_observe(
            "captcha_display_latency_ms",
            (time.perf_counter() - request_start) * 1000,
            duplicate=is_duplicate,
        )

        timeout = 3600 if body.get("test_no_timeout") else self.dependencies.captcha_timeout
        await _wait_for_session_event(session, timeout)

        if session.result is None:
            await self._handle_timeout(session, owner_label, body)

        result = session.result
        self.sessions.pop(captcha_id)
        gauge_set("captcha_pending_count", self.sessions.count())
        if result:
            result["usage_log_id"] = usage_log_id
            result["captcha_id"] = captcha_id
        self._log(
            rid,
            captcha_id,
            "finish",
            request_start,
            mode="manual",
            status=result.get("status") if isinstance(result, dict) else "null",
            has_result=result is not None,
        )
        histogram_observe("captcha_solve_duration_ms", (time.perf_counter() - request_start) * 1000, mode="manual")
        return 200, result

    async def submit_solution(self, request: Any) -> tuple[int, dict[str, Any]]:
        """Handle the ``/solve`` business flow for a pending captcha session."""

        request_start = time.perf_counter()
        body = _to_payload(request)
        captcha_id = body.get("captcha_id")
        variant_index = body.get("variantIndex", 0)
        session = self.sessions.get(captcha_id)

        if session is None:
            self._log("usage:none", captcha_id, "solve_finish", request_start, status=404)
            return 404, {"error": f"Captcha {captcha_id} not found or already solved"}
        if session.result is not None:
            return 200, {"already_solved": True, "captcha_id": captcha_id}

        solver_label = None
        solved_by_super = False
        api_key = body.get("api_key")
        if api_key and self.dependencies.get_key_record is not None:
            key_record = self.dependencies.get_key_record(api_key)
            if not key_record:
                return 403, {"error": "Invalid API key"}
            solver_label = key_record.get("label")
            solver_id = key_record["id"]
            owner_id = session.api_key_id
            has_super_flag = key_record.get("is_super_kiosk", False)
            if not has_super_flag and solver_id != owner_id:
                return 403, {"error": "API key does not own this captcha"}
            if has_super_flag and solver_id != owner_id:
                subs = (
                    self.dependencies.get_super_subscriptions(solver_id)
                    if self.dependencies.get_super_subscriptions
                    else None
                )
                if subs is not None and len(subs) > 0 and owner_id not in subs:
                    return 403, {"error": "Super kiosk not subscribed to this captcha owner"}
                solved_by_super = True

        usage_log_id = body.get("usage_log_id")
        if usage_log_id and self.dependencies.verify_usage_log_matches_captcha:
            if not self.dependencies.verify_usage_log_matches_captcha(usage_log_id, captcha_id):
                return 403, {"error": "Usage log ID does not match this captcha"}

        if session.captcha_type == 1 and body.get("coordinates"):
            tile_ids = body.get("coordinates")
            variant_index = 0
        elif session.captcha_type == 1:
            tile_ids = []
            variant_index = 0
        else:
            tile_ids = session.variants[variant_index]

        result_id = self.dependencies.next_result_id()
        result = {
            "variantIndex": variant_index,
            "variantTiles": tile_ids,
            "solved_by_super": solved_by_super,
            "solver_label": solver_label,
            "resultFile": f"captcha_{captcha_id}_{result_id:04d}.json",
        }
        if session.captcha_type == 1:
            result["captcha_type"] = 1

        self.sessions.set_result(captcha_id, result)
        await self._publish(
            CaptchaSolved(
                captcha_id=captcha_id,
                usage_log_id=usage_log_id or session.usage_log_id,
                api_key_id=session.api_key_id,
                variant_index=variant_index,
                solved_by_super=solved_by_super,
                solver_label=solver_label,
            )
        )

        owner_label = self.dependencies.get_owner_label(session.api_key_id)
        self.dependencies.push_sse(
            {
                "type": "captcha_solved",
                "captcha_id": captcha_id,
                "solved_by_super": solved_by_super,
                "solver_label": solver_label,
                "owner_label": owner_label,
                "owner_api_key_id": session.api_key_id,
            },
            api_key_id=session.api_key_id,
        )
        self._log("usage:none", captcha_id, "solve_finish", request_start, status=200)
        histogram_observe("captcha_solve_duration_ms", (time.perf_counter() - request_start) * 1000, mode="submit")
        return 200, result

    def _top3(self, data: dict[str, Any], captcha_id: str) -> tuple[list[str], bool]:
        """Return solver hints when sync metadata is enabled, otherwise defer."""

        if not self.dependencies.sync_solver_metadata():
            self.dependencies.enqueue_metadata(captcha_id, "disabled")
            return [], False
        try:
            return self.dependencies.get_top3(data) or [], False
        except Exception as exc:
            self.dependencies.enqueue_metadata(captcha_id, f"top3_failed:{exc}")
            return [], False

    async def _wait_duplicate(
        self,
        session: CaptchaSession,
        body: dict[str, Any],
        captcha_id: str,
        usage_log_id: int,
    ) -> dict[str, Any]:
        """Wait on an existing duplicate session and shape its response."""

        await _wait_for_session_event(session, self.dependencies.captcha_timeout)
        result = session.result
        if result is None:
            result = {
                "status": "timeout",
                "error": "captcha_timeout",
                "usage_log_id": usage_log_id,
                "captcha_id": captcha_id,
            }
        result["usage_log_id"] = usage_log_id
        result["captcha_id"] = captcha_id
        return result

    def _push_display(
        self,
        *,
        session: CaptchaSession,
        data: dict[str, Any],
        top3: list[str],
        confident: bool,
        owner_label: str,
        is_distributed: bool,
        metadata: dict[str, Any],
    ) -> None:
        """Publish the legacy ``new_captcha`` SSE message for a session."""

        message = {
            "type": "new_captcha",
            "captcha_id": session.captcha_id,
            "images": session.images,
            "count": len(session.images),
            "top3": top3,
            "confident": confident,
            "created_at": time.time(),
            "timeout": self.dependencies.captcha_timeout,
            "owner_label": owner_label,
            "owner_api_key_id": session.api_key_id,
        }
        if is_icon_click_type(data):
            message["captcha_type"] = 1
            message["icons_image"] = session.icons_image
        if is_distributed:
            message["distribution"] = session.distribution
            message.update(metadata.get("sse_extra", {}))
        self.dependencies.push_sse(message, api_key_id=session.api_key_id)
        for extra_message, target_id in metadata.get("extra_sse", []):
            self.dependencies.push_sse(extra_message, api_key_id=target_id)

    async def _handle_timeout(
        self,
        session: CaptchaSession,
        owner_label: str,
        body: dict[str, Any],
    ) -> None:
        """Notify adapters and optionally return timeout metadata to callers."""

        message = {
            "type": "captcha_timeout",
            "captcha_id": session.captcha_id,
            "owner_label": owner_label,
            "owner_api_key_id": session.api_key_id,
        }
        self.dependencies.push_sse(message, api_key_id=session.api_key_id)
        if self.dependencies.on_timeout is not None:
            maybe = self.dependencies.on_timeout(
                session.captcha_id,
                session.api_key_id,
                session.usage_log_id,
                message,
            )
            if inspect.isawaitable(maybe):
                await maybe
        await self._publish(
            CaptchaTimedOut(
                captcha_id=session.captcha_id,
                usage_log_id=session.usage_log_id,
                api_key_id=session.api_key_id,
            )
        )
        if body.get("timeout_metadata"):
            session.result = {
                "status": "timeout",
                "error": "captcha_timeout",
                "usage_log_id": session.usage_log_id,
                "captcha_id": session.captcha_id,
            }

    async def _publish(self, event: Any) -> None:
        """Publish a core event through the injected event publisher."""

        maybe = self.dependencies.publish_event(event)
        if inspect.isawaitable(maybe):
            await maybe

    def _log(self, *args, **kwargs) -> None:
        """Delegate runtime step logging to the HTTP adapter."""

        self.dependencies.log_step(*args, **kwargs)


def _to_payload(request: Any) -> dict[str, Any]:
    """Normalize Pydantic models and plain dictionaries into a mutable dict."""

    if hasattr(request, "model_dump"):
        return request.model_dump()
    return dict(request)


def _captcha_payload(body: dict[str, Any]) -> dict[str, Any]:
    """Strip transport/control fields before hashing and persisting captcha data."""

    return {
        key: value
        for key, value in body.items()
        if key
        not in {
            "api_key",
            "auto_solve",
            "auto_solve_rucaptcha",
            "timeout_metadata",
            "reservation_id",
            "test_no_timeout",
        }
        and value is not None
    }


def _saved_data(saved: Any, default: dict[str, Any]) -> dict[str, Any]:
    """Extract payload data from save adapter results without coupling to them."""

    return getattr(saved, "data", saved if isinstance(saved, dict) else default)


def _get_value(record: Any, key: str) -> Any:
    """Read API-key fields from either ORM-like objects or dictionaries."""

    if isinstance(record, dict):
        return record.get(key)
    return getattr(record, key)


async def _wait_for_session_event(session: CaptchaSession, timeout: float | int | None) -> bool:
    """Wait for a session event without scheduling thread-pool work."""

    if session.event.is_set():
        return True
    if timeout is None:
        while not session.event.is_set():
            await asyncio.sleep(0.01)
        return True
    deadline = time.monotonic() + float(timeout)
    while time.monotonic() < deadline:
        if session.event.is_set():
            return True
        await asyncio.sleep(0.01)
    return session.event.is_set()
