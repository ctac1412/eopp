"""
Bump plugin version and copy to data/plugins/{version}/.

Reads version from yandex-browser-plugin/dist/manifest.json,
increments patch version, copies built files to data/plugins/{version}/,
and updates manifest.json with new version.
"""

import json
import os
import shutil
import time
from datetime import UTC, datetime

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(PROJECT_DIR, "yandex-browser-plugin", "dist")
PLUGINS_DIR = os.path.join(PROJECT_DIR, "data", "plugins")
MANIFEST_PATH = os.path.join(DIST_DIR, "manifest.json")


def bump_version(version: str) -> str:
    """Increment patch version: 1.0.1 -> 1.0.2"""
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid version format: {version}. Expected semver (e.g. 1.0.1)")
    parts[2] = str(int(parts[2]) + 1)
    return ".".join(parts)


def main():
    if not os.path.isdir(DIST_DIR):
        print("Error: dist/ not found. Run 'make build-extension' first.")
        return

    if not os.path.isfile(MANIFEST_PATH):
        print("Error: manifest.json not found in dist/")
        return

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    current_version = manifest.get("version", "0.0.1")
    new_version = bump_version(current_version)

    print(f"Current version: {current_version}")
    print(f"New version: {new_version}")

    manifest["version"] = new_version

    version_dir = os.path.join(PLUGINS_DIR, new_version)
    if os.path.exists(version_dir):
        print(f"Warning: version {new_version} already exists, overwriting...")
        shutil.rmtree(version_dir)

    os.makedirs(version_dir, exist_ok=True)

    for item in os.listdir(DIST_DIR):
        src = os.path.join(DIST_DIR, item)
        dst = os.path.join(version_dir, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    with open(os.path.join(version_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    metadata = {
        "manifest": manifest,
        "uploaded_at": time.time(),
        "note": f"Auto-built v{new_version}",
        "file_count": sum(
            len(files) for _, _, files in os.walk(version_dir)
        ),
    }
    with open(os.path.join(version_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Plugin v{new_version} saved to data/plugins/{new_version}/")


if __name__ == "__main__":
    main()
