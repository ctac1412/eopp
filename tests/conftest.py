"""Root-level pytest shim for plan-documented test commands.

The server test suite keeps its real fixtures under ``server/tests``. This
wrapper lets ``uv run pytest tests/...`` reuse those fixtures without moving the
existing test layout.
"""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_ROOT = os.path.join(PROJECT_ROOT, "server")
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, SERVER_ROOT)

from server.tests.conftest import *  # noqa: E402,F403
