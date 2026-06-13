"""Environment-driven bootstrap for a local technical login user.

This module intentionally keeps the technical user out of migrations. A server
gets this login only when deployment/runtime environment variables explicitly
provide both login and password.
"""

from __future__ import annotations

import logging
import os

from sqlalchemy.exc import IntegrityError

from src.entities import User, get_session
from src.modules.access.permissions import ROLE_PERMISSIONS
from src.repositories.user_repo import hash_password

logger = logging.getLogger("eopp.auth.bootstrap")

DEFAULT_TECH_USER_NAME = "Technical Test User"
DEFAULT_TECH_USER_ROLE = "super_admin"


def ensure_env_tech_user() -> None:
    """Create or update the env-configured technical user, if configured.

    Required environment variables:
    - ``EOPP_TECH_USER_LOGIN``
    - ``EOPP_TECH_USER_PASSWORD``

    Optional:
    - ``EOPP_TECH_USER_NAME`` defaults to ``Technical Test User``
    - ``EOPP_TECH_USER_ROLE`` defaults to ``super_admin``
    """

    login = os.environ.get("EOPP_TECH_USER_LOGIN", "").strip()
    password = os.environ.get("EOPP_TECH_USER_PASSWORD", "")
    if not login and not password:
        return
    if not login or not password:
        logger.warning("tech_user bootstrap skipped: login and password must both be set")
        return

    role = os.environ.get("EOPP_TECH_USER_ROLE", DEFAULT_TECH_USER_ROLE).strip() or DEFAULT_TECH_USER_ROLE
    if role not in ROLE_PERMISSIONS:
        logger.warning("tech_user bootstrap skipped: unknown role %s", role)
        return

    name = os.environ.get("EOPP_TECH_USER_NAME", DEFAULT_TECH_USER_NAME).strip() or DEFAULT_TECH_USER_NAME
    password_hash = hash_password(password)

    with get_session() as session:
        user = session.query(User).filter(User.login == login).first()
        if user:
            user.name = name
            user.password_hash = password_hash
            user.role = role
            user.active = True
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                logger.exception("tech_user bootstrap failed while updating login=%s", login)
                return
            logger.info("tech_user ensured login=%s role=%s action=updated", login, role)
            return

        from datetime import UTC, datetime

        session.add(
            User(
                name=name,
                login=login,
                password_hash=password_hash,
                role=role,
                system_role=role if role in {"super_admin", "administrator"} else None,
                active=True,
                created_at=datetime.now(UTC).isoformat(),
            )
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            logger.exception("tech_user bootstrap failed while creating login=%s", login)
            return
        logger.info("tech_user ensured login=%s role=%s action=created", login, role)
