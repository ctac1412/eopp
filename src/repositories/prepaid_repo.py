from datetime import UTC, datetime

from src.entities import PrepaidPackage, get_session


def list_prepaid_packages() -> list[PrepaidPackage]:
    with get_session() as session:
        return session.query(PrepaidPackage).order_by(PrepaidPackage.created_at.desc()).all()


def create_prepaid_package(
    api_key_id: int, balance_amount: int, active: bool = True
) -> PrepaidPackage:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        pkg = PrepaidPackage(
            api_key_id=api_key_id,
            balance_amount=balance_amount,
            active=active,
            created_at=now,
            updated_at=now,
        )
        session.add(pkg)
        session.commit()
        session.refresh(pkg)
        return pkg


def update_prepaid_package(
    package_id: int,
    balance_amount: int | None = None,
    active: bool | None = None,
) -> PrepaidPackage | None:
    with get_session() as session:
        pkg = session.get(PrepaidPackage, package_id)
        if not pkg:
            return None
        if balance_amount is not None:
            pkg.balance_amount = balance_amount
        if active is not None:
            pkg.active = active
        pkg.updated_at = datetime.now(UTC).isoformat()
        session.commit()
        session.refresh(pkg)
        return pkg


def top_up_prepaid_package(package_id: int, amount: int) -> PrepaidPackage | None:
    with get_session() as session:
        pkg = session.get(PrepaidPackage, package_id)
        if not pkg:
            return None
        pkg.balance_amount += amount
        pkg.updated_at = datetime.now(UTC).isoformat()
        session.commit()
        session.refresh(pkg)
        return pkg


def delete_prepaid_package(package_id: int) -> bool:
    with get_session() as session:
        pkg = session.get(PrepaidPackage, package_id)
        if not pkg:
            return False
        session.delete(pkg)
        session.commit()
        return True


def list_prepaid_deductions(
    package_id: int | None = None,
    api_key_id: int | None = None,
) -> list[dict]:
    from src.db.prepaid import list_prepaid_deductions as db_list_prepaid_deductions

    return db_list_prepaid_deductions(package_id=package_id, api_key_id=api_key_id)
