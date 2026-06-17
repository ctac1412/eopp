"""Defensive flat module registry for optional server extensions.

The protected core HTTP shell owns startup and core route registration. Side
features describe themselves with ``ModuleManifest`` objects that this module
loads defensively: an import, manifest, or router failure disables only that
module and records health details instead of preventing core app startup.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from importlib import import_module
from typing import Any

from fastapi import APIRouter, FastAPI

logger = logging.getLogger("eopp.module_registry")

LifecycleHook = Callable[[], Any | Awaitable[Any]]


@dataclass(frozen=True)
class ModuleManifest:
    """Flat declaration of an optional server module's integration points.

    ``routers`` are included into the FastAPI app by the platform shell.
    ``event_handlers`` and ``job_handlers`` are declarative metadata for
    outbox/worker wiring and health visibility; handlers still register
    themselves in their owning worker processes. ``startup`` and ``shutdown``
    are reserved lifecycle hooks and must not be used for core-critical work.
    """

    name: str
    routers: tuple[APIRouter, ...] = ()
    event_handlers: Mapping[str, Callable[..., Any] | str] = field(default_factory=dict)
    job_handlers: Mapping[str, Callable[..., Any] | str] = field(default_factory=dict)
    permissions: tuple[str, ...] = ()
    startup: tuple[LifecycleHook, ...] = ()
    shutdown: tuple[LifecycleHook, ...] = ()


@dataclass(frozen=True)
class ModuleStatus:
    """Health-visible result of trying to load and attach one module."""

    name: str
    enabled: bool
    routers: int = 0
    event_handlers: int = 0
    job_handlers: int = 0
    permissions: tuple[str, ...] = ()
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-safe representation for health endpoints."""

        return {
            "name": self.name,
            "enabled": self.enabled,
            "routers": self.routers,
            "event_handlers": self.event_handlers,
            "job_handlers": self.job_handlers,
            "permissions": list(self.permissions),
            "error": self.error,
        }


def register_modules(
    app: FastAPI,
    manifest_paths: Iterable[str],
    *,
    prefix: str = "",
) -> tuple[ModuleStatus, ...]:
    """Import manifests, attach routers, and store defensive status on ``app``.

    Import errors, malformed manifests, failing lifecycle hooks, or router
    inclusion errors are caught per module. The function returns all statuses
    and also stores them in ``app.state.module_statuses`` for health reporting.
    """

    statuses: list[ModuleStatus] = []
    startup_hooks: list[LifecycleHook] = []
    shutdown_hooks: list[LifecycleHook] = []
    for manifest_path in manifest_paths:
        status, startup, shutdown = _register_one_module(app, manifest_path, prefix=prefix)
        statuses.append(status)
        startup_hooks.extend(startup)
        shutdown_hooks.extend(shutdown)

    app.state.module_statuses = tuple(statuses)
    app.state.module_startup_hooks = tuple(startup_hooks)
    app.state.module_shutdown_hooks = tuple(shutdown_hooks)
    return tuple(statuses)


def _register_one_module(
    app: FastAPI,
    manifest_path: str,
    *,
    prefix: str = "",
) -> tuple[ModuleStatus, tuple[LifecycleHook, ...], tuple[LifecycleHook, ...]]:
    """Load one manifest and include its routers without leaking failures."""

    try:
        manifest = load_manifest(manifest_path)
        for router in manifest.routers:
            app.include_router(router, prefix=prefix)
        _run_sync_hooks(manifest.startup, manifest.name, "startup")
    except Exception as exc:
        logger.exception("module_disabled name=%s error=%s", manifest_path, exc)
        return (
            ModuleStatus(name=_status_name(manifest_path, locals().get("manifest")), enabled=False, error=str(exc)),
            (),
            (),
        )

    return (
        ModuleStatus(
            name=manifest.name,
            enabled=True,
            routers=len(manifest.routers),
            event_handlers=len(manifest.event_handlers),
            job_handlers=len(manifest.job_handlers),
            permissions=tuple(manifest.permissions),
        ),
        tuple(manifest.startup),
        tuple(manifest.shutdown),
    )


def load_manifest(manifest_path: str) -> ModuleManifest:
    """Import and validate a module manifest from ``manifest_path``."""

    module = import_module(manifest_path)
    manifest = getattr(module, "manifest", None)
    if manifest is None:
        factory = getattr(module, "get_manifest", None)
        if callable(factory):
            manifest = factory()
    if not isinstance(manifest, ModuleManifest):
        raise TypeError(f"{manifest_path} must expose ModuleManifest as manifest or get_manifest()")
    if not manifest.name:
        raise ValueError(f"{manifest_path} manifest name is required")
    return manifest


def module_health_payload(app: FastAPI) -> dict[str, Any]:
    """Build a stable health payload from module statuses stored on the app."""

    statuses = tuple(getattr(app.state, "module_statuses", ()))
    degraded = any(not status.enabled for status in statuses)
    return {
        "status": "degraded" if degraded else "ok",
        "modules": [status.as_dict() for status in statuses],
    }


def _run_sync_hooks(hooks: Iterable[LifecycleHook], module_name: str, hook_name: str) -> None:
    """Run synchronous lifecycle hooks and reject async hooks until lifespan wiring exists."""

    for hook in hooks:
        result = hook()
        if inspect.isawaitable(result):
            raise TypeError(f"{module_name} {hook_name} hook {hook!r} returned awaitable")


def _status_name(manifest_path: str, manifest: object | None) -> str:
    """Prefer manifest.name for loaded-but-failing modules, else use import path."""

    if isinstance(manifest, ModuleManifest) and manifest.name:
        return manifest.name
    return manifest_path
