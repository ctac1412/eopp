from datetime import UTC, datetime

from src.entities import User, get_session


def list_users() -> list[User]:
    with get_session() as session:
        return session.query(User).order_by(User.name).all()


def create_user(name: str) -> User:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        user = User(name=name, created_at=now)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def update_user(user_id: int, name: str) -> User | None:
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return None
        user.name = name
        session.commit()
        session.refresh(user)
        return user


def delete_user(user_id: int) -> bool:
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            return False
        session.delete(user)
        session.commit()
        return True
