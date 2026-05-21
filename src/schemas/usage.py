"""Usage API schemas.

Keep usage-specific request bodies importable from a small module so route and
service changes do not require loading the whole global models file.
"""

from src.models import ConfirmUsageBody, FailUsageBody, RegisterUsageBody, UpdateUsageLogBody

__all__ = [
    "ConfirmUsageBody",
    "FailUsageBody",
    "RegisterUsageBody",
    "UpdateUsageLogBody",
]
