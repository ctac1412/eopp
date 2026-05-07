"""
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

from fastapi.responses import FileResponse, JSONResponse

from src.constants import PLUGINS_DIR


def register_plugin_static_routes(app):
    if not os.path.isdir(PLUGINS_DIR):
        return

    @app.get("/plugins/update.xml")
    async def serve_plugin_update():
        file_path = os.path.join(PLUGINS_DIR, "update.xml")
        if not os.path.isfile(file_path):
            return JSONResponse(status_code=404, content={"error": "update.xml not found"})
        return FileResponse(file_path, media_type="application/xml")

    @app.get("/plugins/latest")
    async def serve_plugin_latest():
        crx_files = [f for f in os.listdir(PLUGINS_DIR) if f.endswith(".crx")]
        if not crx_files:
            return JSONResponse(status_code=404, content={"error": "No CRX files found"})
        crx_files.sort()
        latest = crx_files[-1]
        return FileResponse(
            os.path.join(PLUGINS_DIR, latest),
            media_type="application/x-chrome-extension",
            filename=latest,
        )

    @app.get("/plugins/{filename}")
    async def serve_plugin_file(filename: str):
        file_path = os.path.join(PLUGINS_DIR, filename)
        if not os.path.isfile(file_path):
            return JSONResponse(status_code=404, content={"error": "File not found"})

        ext = os.path.splitext(filename)[1].lower()
        media_map = {
            ".crx": "application/x-chrome-extension",
            ".xml": "application/xml",
            ".pem": "application/x-pem-file",
            ".json": "application/json",
        }
        return FileResponse(file_path, media_type=media_map.get(ext, "application/octet-stream"))
