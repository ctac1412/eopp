"""Custom errors for server startup and runtime."""


class StartupError(RuntimeError):
    """Fatal configuration error — server must not start."""
