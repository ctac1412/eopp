"""Plugin management routes — upload, list, download, and delete plugin versions."""

import os
import tempfile

from fastapi.responses import FileResponse, JSONResponse

from src.models import UploadPluginBody
from src.plugins import (
    _build_zip,
    _get_version_dir,
    delete_version,
    get_latest_version,
    get_versions,
    upload_plugin,
)


def register_plugin_routes(app):
    @app.get("/plugins")
    async def list_plugins():
        return JSONResponse(content={"versions": get_versions()})

    @app.get("/plugins/latest")
    async def latest_plugin():
        """
        Chrome extension update endpoint.

        Returns JSON in the format expected by Chrome's update mechanism:
        {
          "versions": [
            {
              "platform": "chrome",
              "version": "1.0.1",
              "manifest_version": 3,
              "downloads": ["https://..."]
            }
          ]
        }
        """
        latest = get_latest_version()
        if latest is None:
            return JSONResponse(status_code=404, content={"error": "No plugin versions available"})

        manifest = latest.get("manifest", {})
        downloads = [f"https://china.alabai.netcraze.pro/plugins/{latest['version']}/download"]

        return JSONResponse(
            content={
                "versions": [
                    {
                        "platform": "chrome",
                        "version": latest["version"],
                        "manifest_version": manifest.get("manifest_version", 3),
                        "downloads": downloads,
                    }
                ]
            }
        )

    @app.get("/plugins/{version}/download")
    async def download_plugin(version: str):
        """Download the ZIP archive for a specific version."""
        version_dir = _get_version_dir(version)
        if not os.path.isdir(version_dir):
            return JSONResponse(status_code=404, content={"error": "Version not found"})

        zip_path = _build_zip(version)
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=f"eopp-injector-{version}.zip",
        )

    @app.get("/plugins/{version}/manifest")
    async def get_plugin_manifest(version: str):
        """Get the manifest.json for a specific version."""
        manifest_path = os.path.join(_get_version_dir(version), "manifest.json")
        if not os.path.isfile(manifest_path):
            return JSONResponse(status_code=404, content={"error": "Manifest not found"})
        return FileResponse(manifest_path, media_type="application/json")

    @app.post("/plugins/upload")
    async def upload_plugin_route(body: UploadPluginBody):
        """
        Upload a new plugin version.

        Admin-only: requires X-Admin-Token header.

        The client sends:
        - version: semantic version string
        - manifest: contents of manifest.json
        - note: optional release note
        - zip_file: base64-encoded ZIP archive of the plugin

        Returns:
            dict with version info on success.
        """
        import base64

        tmp_path = None
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
            tmp_path = tmp.name
            with open(tmp_path, "wb") as f:
                f.write(base64.b64decode(body.zip_file))

            result = upload_plugin(
                zip_path=tmp_path,
                version=body.version,
                manifest=body.manifest,
                note=body.note or "",
                overwrite=body.overwrite or False,
            )
            return JSONResponse(content=result)
        except ValueError as e:
            return JSONResponse(status_code=400, content={"error": str(e)})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Upload failed: {e}"})
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @app.delete("/plugins/{version}")
    async def delete_plugin_route(version: str):
        """Delete a plugin version. Admin-only."""
        if delete_version(version):
            return JSONResponse(content={"ok": True})
        return JSONResponse(status_code=404, content={"error": "Version not found"})
