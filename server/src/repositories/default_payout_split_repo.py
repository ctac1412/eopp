from datetime import UTC, datetime

from src.entities import DefaultPayoutSplit, get_session


def _split_to_dict(split: DefaultPayoutSplit) -> dict:
    return {
        "user_id": split.user_id,
        "split_pct": float(split.split_pct or 0),
    }


def list_default_payout_splits() -> list[dict]:
    with get_session() as session:
        splits = (
            session.query(DefaultPayoutSplit)
            .order_by(DefaultPayoutSplit.position.asc(), DefaultPayoutSplit.id.asc())
            .all()
        )
        return [_split_to_dict(split) for split in splits]


def replace_default_payout_splits(splits: list[dict]) -> list[dict]:
    now = datetime.now(UTC).isoformat()
    with get_session() as session:
        session.query(DefaultPayoutSplit).delete()
        for index, split in enumerate(splits):
            user_id = split.get("user_id")
            if user_id is None:
                continue
            session.add(
                DefaultPayoutSplit(
                    user_id=int(user_id),
                    split_pct=float(split.get("split_pct") or 0),
                    position=index,
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()
        saved = (
            session.query(DefaultPayoutSplit)
            .order_by(DefaultPayoutSplit.position.asc(), DefaultPayoutSplit.id.asc())
            .all()
        )
        return [_split_to_dict(split) for split in saved]
