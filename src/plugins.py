"""Plugin version storage and management for the browser extension."""

import json
import os
import shutil
import zipfile
import time
from typing import Optional

from src.constants import PLUGINS_DIR

# In-memory cache of plugin metadata
_plugins_cache: Optional[list[dict]] = None


def _ensure_plugins_dir():
    os.makedirs(PLUGINS_DIR, exist_ok=True)


def _get_version_dir(version: str) -> str:
    return os.path.join(PLUGINS_DIR, version)


def _load_metadata(version: str) -> Optional[dict]:
    meta_path = os.path.join(_get_version_dir(version), "metadata.json")
    if not os.path.exists(meta_path):
        return None
    with open(meta_path, "r") as f:
        return json.load(f)


def _save_metadata(version: str, data: dict):
    meta_path = os.path.join(_get_version_dir(version), "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(data, f, indent=2)


def _build_zip(version: str) -> str:
    """Build a ZIP archive for the given version and return its path."""
    version_dir = _get_version_dir(version)
    zip_path = os.path.join(version_dir, f"plugin-{version}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(version_dir):
            for fname in files:
                if fname == f"plugin-{version}.zip" or fname == "metadata.json":
                    continue
                full = os.path.join(root, fname)
                arc = os.path.relpath(full, version_dir)
                zf.write(full, arc)
    return zip_path


def get_versions() -> list[dict]:
    """Return list of all plugin versions with metadata, sorted by version desc."""
    _ensure_plugins_dir()
    versions = []
    for entry in os.listdir(PLUGINS_DIR):
        version_dir = os.path.join(PLUGINS_DIR, entry)
        if not os.path.isdir(version_dir):
            continue
        meta = _load_metadata(entry)
        if meta is None:
            continue
        versions.append(
            {
                "version": entry,
                "manifest": meta.get("manifest", {}),
                "uploaded_at": meta.get("uploaded_at"),
                "note": meta.get("note", ""),
                "file_count": meta.get("file_count", 0),
            }
        )
    versions.sort(key=lambda v: v["version"], reverse=True)
    return versions


def get_latest_version() -> Optional[dict]:
    """Return the latest plugin version info."""
    versions = get_versions()
    if not versions:
        return None
    return versions[0]


def upload_plugin(
    zip_path: str,
    version: str,
    manifest: dict,
    note: str = "",
    overwrite: bool = False,
) -> dict:
    """
    Upload a new plugin version from a ZIP file.

    Args:
        zip_path: Path to the uploaded ZIP archive.
        version: Semantic version string (e.g. '1.0.1').
        manifest: Parsed manifest.json content.
        note: Optional release note.
        overwrite: If True, replace existing version.

    Returns:
        dict with version info.

    Raises:
        ValueError on invalid input or conflicts.
    """
    _ensure_plugins_dir()
    version_dir = _get_version_dir(version)

    if os.path.exists(version_dir) and not overwrite:
        raise ValueError(
            f"Version {version} already exists. Use overwrite=True to replace."
        )

    if os.path.exists(version_dir):
        shutil.rmtree(version_dir)
    os.makedirs(version_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(version_dir)

    files = []
    for root, dirs, fnames in os.walk(version_dir):
        for fn in fnames:
            if fn == "metadata.json":
                continue
            rel = os.path.relpath(os.path.join(root, fn), version_dir)
            size = os.path.getsize(os.path.join(root, fn))
            files.append({"path": rel, "size": size})

    _save_metadata(
        version,
        {
            "manifest": manifest,
            "uploaded_at": time.time(),
            "note": note,
            "file_count": len(files),
        },
    )

    _build_zip(version)

    return {
        "version": version,
        "manifest": manifest,
        "uploaded_at": time.time(),
        "note": note,
        "file_count": len(files),
    }


def delete_version(version: str) -> bool:
    """Delete a plugin version. Returns True if deleted, False if not found."""
    version_dir = _get_version_dir(version)
    if not os.path.isdir(version_dir):
        return False
    shutil.rmtree(version_dir)
    return True
