"""Application logging setup."""

from __future__ import annotations

import logging
import os


def _level_from_env(name: str, default: str) -> int:
    raw = os.environ.get(name, default).upper()
    return getattr(logging, raw, logging.INFO)


def configure_logging() -> int:
    """Configure root and app loggers from environment."""
    level = _level_from_env("EOPP_LOG_LEVEL", "INFO")
    fmt = "%(asctime)s.%(msecs)03d [%(levelname)-5s] %(name)s %(message)s"

    logging.basicConfig(level=level, format=fmt, datefmt="%H:%M:%S", force=True)
    # Also patch any existing handlers directly
    for h in logging.getLogger().handlers:
        h.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))

    logging.getLogger("eopp").setLevel(level)
    return level
