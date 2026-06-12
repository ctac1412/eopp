"""Manifest for the optional operator training side module.

Training owns course/test-run HTTP routes and may depend on captcha datasets,
operator repositories, and classifier helpers. It is not required for protected
captcha solving, so the platform registry may disable it independently.
"""

from __future__ import annotations

from src.platform.module_registry import ModuleManifest
from src.routes.training import router


manifest = ModuleManifest(
    name="training",
    routers=(router,),
    permissions=("training.view", "training.manage"),
)
"""Flat declaration used by the platform module registry."""
