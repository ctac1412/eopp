"""Access module containing RBAC permissions and authorization services."""

from src.modules.access.permissions import Permission
from src.modules.access.service import AccessService

__all__ = ["AccessService", "Permission"]
