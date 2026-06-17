"""Bounded pending captcha session state for the protected runtime."""

from __future__ import annotations

import threading
from collections.abc import MutableMapping
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CaptchaSession:
    """Mutable pending captcha state shared by runtime and legacy adapters.

    The class intentionally exposes a small dict-like surface because older
    admin, health, and distribution code still reads entries from the global
    SSE pending map with ``entry.get(...)`` and ``entry["result"]``.
    """

    captcha_id: str
    variants: list
    images: dict[str, str]
    usage_log_id: int | None
    api_key_id: int | None
    event: threading.Event = field(default_factory=threading.Event)
    result: dict[str, Any] | None = None
    captcha_type: int | None = None
    icons_image: str = ""
    tiles: list[dict[str, Any]] = field(default_factory=list)
    valid_index: int | None = None
    timeout: int | float | None = None
    distribution: dict[str, Any] | None = None
    icons_cache: dict[Any, Any] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    def wait(self, timeout: float | int | None) -> bool:
        """Block the caller until a solution arrives or timeout expires."""

        return self.event.wait(timeout)

    def to_mapping(self) -> dict[str, Any]:
        """Return a legacy-compatible dictionary view of this session."""

        data = {
            "captcha_id": self.captcha_id,
            "variants": self.variants,
            "images": self.images,
            "event": self.event,
            "result": self.result,
            "usage_log_id": self.usage_log_id,
            "api_key_id": self.api_key_id,
            "tiles": self.tiles,
            "valid_index": self.valid_index,
        }
        if self.timeout is not None:
            data["timeout"] = self.timeout
        if self.captcha_type is not None:
            data["captcha_type"] = self.captcha_type
        if self.icons_image:
            data["icons_image"] = self.icons_image
        if self.distribution is not None:
            data["distribution"] = self.distribution
        if self.icons_cache:
            data["icons_cache"] = self.icons_cache
        data.update(self.extra)
        return data

    def get(self, key: str, default: Any = None) -> Any:
        """Read a value using the mapping API expected by legacy callers."""

        return self.to_mapping().get(key, default)

    def __getitem__(self, key: str) -> Any:
        """Return a mapping value for code that still indexes pending entries."""

        return self.to_mapping()[key]

    def __setitem__(self, key: str, value: Any) -> None:
        """Update a known session field or store an adapter-specific extra."""

        if key == "result":
            self.result = value
        elif key == "event":
            self.event = value
        elif key == "usage_log_id":
            self.usage_log_id = value
        elif key == "api_key_id":
            self.api_key_id = value
        elif key == "variants":
            self.variants = value
        elif key == "images":
            self.images = value
        elif key == "captcha_type":
            self.captcha_type = value
        elif key == "icons_image":
            self.icons_image = value
        elif key == "tiles":
            self.tiles = value
        elif key == "valid_index":
            self.valid_index = value
        elif key == "timeout":
            self.timeout = value
        elif key == "distribution":
            self.distribution = value
        elif key == "icons_cache":
            self.icons_cache = value
        else:
            self.extra[key] = value


class CaptchaSessionStore:
    """Thread-safe pending captcha store with duplicate detection.

    The store can wrap the existing ``src.sse.pending`` dictionary so Phase 2
    can move runtime behavior into core without breaking routes that still
    inspect pending captcha state directly.
    """

    def __init__(
        self,
        pending: MutableMapping[str, Any] | None = None,
        lock: threading.Lock | threading.RLock | None = None,
    ) -> None:
        self._pending = pending if pending is not None else {}
        self._lock = lock if lock is not None else threading.Lock()

    def add_or_get(self, session: CaptchaSession) -> tuple[CaptchaSession, bool]:
        """Insert a new session or return the already-pending duplicate."""

        with self._lock:
            existing = self._pending.get(session.captcha_id)
            if existing is not None:
                return self._coerce(existing), True
            self._pending[session.captcha_id] = session
            return session, False

    def get(self, captcha_id: str) -> CaptchaSession | None:
        """Return a pending session by captcha id, if it still exists."""

        with self._lock:
            existing = self._pending.get(captcha_id)
        return self._coerce(existing) if existing is not None else None

    def get_by_usage_log_id(self, usage_log_id: int) -> CaptchaSession | None:
        """Return the pending session attached to a usage log, if any."""

        with self._lock:
            for entry in self._pending.values():
                session = self._coerce(entry)
                if session.usage_log_id == usage_log_id:
                    return session
        return None

    def pop(self, captcha_id: str) -> CaptchaSession | None:
        """Remove and return a pending session after solve or timeout."""

        with self._lock:
            existing = self._pending.pop(captcha_id, None)
        return self._coerce(existing) if existing is not None else None

    def count(self) -> int:
        """Return the number of currently pending captcha sessions."""

        with self._lock:
            return len(self._pending)

    def set_result(self, captcha_id: str, result: dict[str, Any]) -> CaptchaSession | None:
        """Store a solution result and wake every waiter on the session."""

        session = self.get(captcha_id)
        if session is None:
            return None
        session.result = result
        session.event.set()
        return session

    def clear_timeouts(self) -> None:
        """Remove sessions whose event has already been signaled."""

        with self._lock:
            expired = [
                captcha_id
                for captcha_id, entry in self._pending.items()
                if self._coerce(entry).event.is_set()
            ]
            for captcha_id in expired:
                self._pending.pop(captcha_id, None)

    @staticmethod
    def _coerce(entry: Any) -> CaptchaSession:
        """Adapt legacy dict entries into ``CaptchaSession`` instances."""

        if isinstance(entry, CaptchaSession):
            return entry
        session = CaptchaSession(
            captcha_id=entry.get("captcha_id"),
            variants=entry.get("variants", []),
            images=entry.get("images", {}),
            event=entry.get("event"),
            result=entry.get("result"),
            usage_log_id=entry.get("usage_log_id"),
            api_key_id=entry.get("api_key_id"),
            captcha_type=entry.get("captcha_type"),
            icons_image=entry.get("icons_image", ""),
            tiles=entry.get("tiles", []),
            valid_index=entry.get("valid_index"),
            timeout=entry.get("timeout"),
            distribution=entry.get("distribution"),
            icons_cache=entry.get("icons_cache", {}),
        )
        return session
