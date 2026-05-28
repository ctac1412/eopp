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
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s %(message)s",
        datefmt="%H:%M:%S",
    )
    handler = logging.StreamHandler()
    handler.setFormatter(fmt)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    logging.getLogger("eopp").setLevel(level)
    return level
