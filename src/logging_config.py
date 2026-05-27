"""Application logging setup."""

from __future__ import annotations

import logging
import os


def _level_from_env(name: str, default: str) -> int:
    raw = os.environ.get(name, default).upper()
    return getattr(logging, raw, logging.INFO)


def configure_logging() -> int:
    """Configure root and app loggers from environment.

    EOPP_LOG_LEVEL controls application logs. Use DEBUG for detailed timings.
    """
    level = _level_from_env("EOPP_LOG_LEVEL", "INFO")
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )
    logging.getLogger("eopp").setLevel(level)
    return level
