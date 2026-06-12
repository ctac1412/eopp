"""Background jobs for captcha archive and solver metadata side-work."""

from __future__ import annotations

import os
from typing import Any


def persist_captcha_json(payload: dict[str, Any]) -> None:
    """Persist a captcha payload JSON file and update its DB file index."""

    from src.services import captcha_file_service

    captcha_id = payload["captcha_id"]
    data = payload.get("data")
    if not isinstance(data, dict):
        data = captcha_file_service.load_captcha_payload(captcha_id)
    if not isinstance(data, dict):
        raise ValueError(f"captcha payload not found for {captcha_id}")

    path = captcha_file_service.captcha_file_path(captcha_id)
    if payload.get("include_solver_metadata", True):
        captcha_file_service.ensure_analysis_metadata(data)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    captcha_file_service.write_captcha_json(path, data)
    captcha_file_service.upsert_captcha_file_data(path, data, captcha_id)


def compute_solver_metadata(payload: dict[str, Any]) -> None:
    """Compute deferred solver metadata for an archived captcha payload."""

    from src.services import captcha_file_service

    captcha_id = payload["captcha_id"]
    data = payload.get("data")
    if not isinstance(data, dict):
        data = captcha_file_service.load_captcha_payload(captcha_id)
    if not isinstance(data, dict):
        raise ValueError(f"captcha payload not found for {captcha_id}")

    changed = captcha_file_service.ensure_analysis_metadata(data)
    path = captcha_file_service.captcha_file_path(captcha_id)
    if changed:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        captcha_file_service.write_captcha_json(path, data)
    captcha_file_service.upsert_captcha_file_data(path, data, captcha_id)


def index_captcha_file(payload: dict[str, Any]) -> None:
    """Refresh the ``captcha_files`` row for an existing captcha JSON file."""

    from src.services import captcha_file_service

    captcha_id = payload["captcha_id"]
    path = captcha_file_service.captcha_file_path(captcha_id)
    row_id = captcha_file_service.upsert_captcha_file(path)
    if row_id is None:
        raise ValueError(f"captcha file could not be indexed for {captcha_id}")


def register_jobs(registry) -> None:
    """Register captcha archive job handlers in the platform worker registry."""

    registry.register("captcha_archive", persist_captcha_json)
    registry.register("captcha_metadata", compute_solver_metadata)
    registry.register("captcha_file_index", index_captcha_file)
