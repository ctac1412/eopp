"""Application service for operator distribution.

The service owns data collection and repository writes. Strategy modules remain
pure so future UI builders can preview a plan before applying it.
"""

from dataclasses import asdict, dataclass
from typing import Callable

from .models import DistributionMaster, DistributionOperator, DistributionPlan
from .strategies import round_robin_active


def _default_list_keys(company_id: int | None = None) -> list[dict]:
    from src.repositories import api_key_repo

    return api_key_repo.list_keys(company_id)


def _default_list_operators(company_id: int | None = None) -> list[dict]:
    from src.repositories import operator_repo

    return operator_repo.list_operators(company_id)


def _default_get_connected_streams() -> list[dict]:
    from src.sse import get_connected_streams

    return get_connected_streams()


def _default_link_operator_to_master(operator_id: int, master_key_id: int) -> tuple[int, list[int]]:
    from src.repositories import operator_repo

    return operator_repo.link_operator_to_master(operator_id, master_key_id)


@dataclass(frozen=True)
class DistributionDependencies:
    """Replaceable IO boundary for collecting and applying distribution plans."""

    list_keys: Callable[[int | None], list[dict]] = _default_list_keys
    list_operators: Callable[[int | None], list[dict]] = _default_list_operators
    get_connected_streams: Callable[[], list[dict]] = _default_get_connected_streams
    link_operator_to_master: Callable[[int, int], tuple[int, list[int]]] = _default_link_operator_to_master


def operator_api_key_id(operator_id: int) -> int:
    """Return the synthetic stream id used by operator SSE connections."""

    return -abs(int(operator_id))


def _online_stream_ids(streams: list[dict]) -> set[int]:
    ids = set()
    for stream in streams:
        try:
            ids.add(int(stream.get("api_key_id")))
        except (TypeError, ValueError):
            continue
    return ids


def _master_label(row: dict) -> str:
    return row.get("label") or f"Ключ #{row.get('id')}"


def _operator_nickname(row: dict) -> str:
    return row.get("nickname") or f"#{row.get('id')}"


def _is_distribution_master(row: dict) -> bool:
    return (
        row.get("active") is not False
        and not row.get("is_external")
        and row.get("is_master_key") is not False
    )


def _allowed_master_ids(row: dict) -> list[int] | None:
    allowed = row.get("allowed_master_keys")
    if allowed is None:
        return None
    return [int(item) for item in allowed if item is not None]


def _scope_allows(operator: dict, master: dict) -> bool:
    operator_allowed = _allowed_master_ids(operator)
    master_id = int(master["id"])
    if operator_allowed is not None and master_id not in operator_allowed:
        return False

    if operator.get("operator_all_companies") and master.get("executor_all_companies"):
        return True

    operator_companies = {int(item) for item in operator.get("operator_company_ids") or []}
    master_companies = {int(item) for item in master.get("executor_company_ids") or []}
    if operator.get("operator_all_companies") and master_companies:
        return True
    if master.get("executor_all_companies") and operator_companies:
        return True
    if operator_companies and master_companies:
        return bool(operator_companies & master_companies)
    return True


def _to_master(row: dict, online_ids: set[int]) -> DistributionMaster:
    return DistributionMaster(
        id=int(row["id"]),
        label=_master_label(row),
        online=int(row["id"]) in online_ids,
    )


def _to_operator(row: dict, masters: list[dict], online_ids: set[int]) -> DistributionOperator:
    allowed_ids = [
        int(master["id"])
        for master in masters
        if _scope_allows(row, master)
    ]
    return DistributionOperator(
        id=int(row["id"]),
        nickname=_operator_nickname(row),
        online=bool(row.get("online")) or operator_api_key_id(row["id"]) in online_ids,
        allowed_master_ids=allowed_ids,
    )


def _plan_to_result(plan: DistributionPlan, *, applied_count: int) -> dict:
    return {
        "strategy": plan.strategy,
        "applied_count": applied_count,
        "assignments": [asdict(item) for item in plan.assignments],
        "skipped": [asdict(item) for item in plan.skipped],
    }


def distribute_active_operators(
    *,
    company_id: int | None = None,
    deps: DistributionDependencies | None = None,
) -> dict:
    """Build and apply the initial active round-robin distribution plan."""

    dependencies = deps or DistributionDependencies()
    streams = dependencies.get_connected_streams()
    online_ids = _online_stream_ids(streams)
    masters = [
        row
        for row in dependencies.list_keys(company_id)
        if _is_distribution_master(row)
    ]
    operators = dependencies.list_operators(company_id)

    plan = round_robin_active(
        [_to_operator(row, masters, online_ids) for row in operators],
        [_to_master(row, online_ids) for row in masters],
    )

    applied_count = 0
    for assignment in plan.assignments:
        dependencies.link_operator_to_master(
            assignment.operator_id,
            assignment.master_key_id,
        )
        applied_count += 1

    return _plan_to_result(plan, applied_count=applied_count)
