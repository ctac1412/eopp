"""
Copy built plugin to data/plugins/{version}/ without version bump.

Reads version from yandex-browser-plugin/dist/manifest.json
and copies files to data/plugins/{version}/.
"""

import json
import os
import shutil
import time

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(PROJECT_DIR, "yandex-browser-plugin", "dist")
PLUGINS_DIR = os.path.join(PROJECT_DIR, "data", "plugins")
MANIFEST_PATH = os.path.join(DIST_DIR, "manifest.json")


def main():
    if not os.path.isdir(DIST_DIR):
        print("Error: dist/ not found. Run 'make build-extension' first.")
        return

    if not os.path.isfile(MANIFEST_PATH):
        print("Error: manifest.json not found in dist/")
        return

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    version = manifest.get("version", "0.0.1")
    version_dir = os.path.join(PLUGINS_DIR, version)

    if os.path.exists(version_dir):
        print(f"Version {version} already exists, overwriting...")
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
        "note": f"Manual build v{version}",
        "file_count": sum(
            len(files) for _, _, files in os.walk(version_dir)
        ),
    }
    with open(os.path.join(version_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Plugin v{version} saved to data/plugins/{version}/")


if __name__ == "__main__":
    main()
