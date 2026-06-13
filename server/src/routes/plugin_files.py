r"""
EOPP Captcha Solver - Plugin Static Files Routes.

Раздача файлов плагинов (.crx, .xml, .pem) из PLUGINS_DIR:
- GET /plugins/update.xml
- GET /plugins/latest
- GET /plugins/{filename}

PLUGINS_DIR берётся из константы:
- Локально: d:\Projects\eopp\plugins
- Docker: /app/plugins (через volume + env EOPP_PLUGINS_DIR)
"""

import os

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

from src.constants import PLUGINS_DIR

router = APIRouter(prefix="/plugins", tags=["plugins"])

_real_plugins_dir = os.path.realpath(PLUGINS_DIR)


def _safe_plugin_path(filename: str) -> str | None:
    resolved = os.path.realpath(os.path.join(_real_plugins_dir, filename))
    common = os.path.commonpath([resolved, _real_plugins_dir])
    if common != _real_plugins_dir:
        return None
    return resolved


@router.get("/update.xml")
async def serve_plugin_update():
    file_path = os.path.join(_real_plugins_dir, "update.xml")
    resolved = os.path.realpath(file_path)
    if os.path.commonpath([resolved, _real_plugins_dir]) != _real_plugins_dir:
        return JSONResponse(status_code=404, content={"error": "update.xml not found"})
    if not os.path.isfile(resolved):
        return JSONResponse(status_code=404, content={"error": "update.xml not found"})
    return FileResponse(resolved, media_type="application/xml")


@router.get("/latest")
async def serve_plugin_latest():
    crx_files = [f for f in os.listdir(_real_plugins_dir) if f.endswith(".crx")]
    if not crx_files:
        return JSONResponse(status_code=404, content={"error": "No CRX files found"})
    crx_files.sort()
    latest = crx_files[-1]
    resolved = os.path.realpath(os.path.join(_real_plugins_dir, latest))
    if os.path.commonpath([resolved, _real_plugins_dir]) != _real_plugins_dir:
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(
        resolved,
        media_type="application/x-chrome-extension",
        filename=latest,
    )


@router.get("/{plugin_name}/update.xml")
async def serve_named_plugin_update(plugin_name: str):
    file_path = _safe_plugin_path(os.path.join(plugin_name, "update.xml"))
    if file_path is None or not os.path.isfile(file_path):
        return JSONResponse(status_code=404, content={"error": "update.xml not found"})
    return FileResponse(file_path, media_type="application/xml")


@router.get("/{plugin_name}/latest")
async def serve_named_plugin_latest(plugin_name: str):
    plugin_dir = _safe_plugin_path(plugin_name)
    if plugin_dir is None or not os.path.isdir(plugin_dir):
        return JSONResponse(status_code=404, content={"error": "Plugin not found"})

    crx_files = [f for f in os.listdir(plugin_dir) if f.endswith(".crx")]
    if not crx_files:
        return JSONResponse(status_code=404, content={"error": "No CRX files found"})
    crx_files.sort()
    latest = crx_files[-1]
    resolved = os.path.realpath(os.path.join(plugin_dir, latest))
    if os.path.commonpath([resolved, plugin_dir]) != plugin_dir:
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(
        resolved,
        media_type="application/x-chrome-extension",
        filename=latest,
    )


@router.get("/{plugin_name}/{filename}")
async def serve_named_plugin_file(plugin_name: str, filename: str):
    file_path = _safe_plugin_path(os.path.join(plugin_name, filename))
    if file_path is None or not os.path.isfile(file_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})

    ext = os.path.splitext(filename)[1].lower()
    media_map = {
        ".crx": "application/x-chrome-extension",
        ".xml": "application/xml",
        ".pem": "application/x-pem-file",
        ".json": "application/json",
    }
    return FileResponse(file_path, media_type=media_map.get(ext, "application/octet-stream"))


@router.get("/{filename}")
async def serve_plugin_file(filename: str):
    file_path = _safe_plugin_path(filename)
    if file_path is None or not os.path.isfile(file_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})

    ext = os.path.splitext(filename)[1].lower()
    media_map = {
        ".crx": "application/x-chrome-extension",
        ".xml": "application/xml",
        ".pem": "application/x-pem-file",
        ".json": "application/json",
    }
    return FileResponse(file_path, media_type=media_map.get(ext, "application/octet-stream"))
