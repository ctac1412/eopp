"""Pure operator distribution strategies.

Strategies must not write to repositories. They only turn candidates into a
plan that can be previewed, tested, or applied by the service layer.
"""

from .models import (
    DistributionAssignment,
    DistributionMaster,
    DistributionOperator,
    DistributionPlan,
    DistributionSkippedOperator,
)


def _sort_label(value: str | None) -> str:
    return (value or "").casefold()


def _operator_allows_master(operator: DistributionOperator, master_id: int) -> bool:
    if operator.allowed_master_ids is None:
        return True
    return int(master_id) in {int(item) for item in operator.allowed_master_ids}


def round_robin_active(
    operators: list[DistributionOperator],
    masters: list[DistributionMaster],
) -> DistributionPlan:
    """Assign online operators to online masters in sorted round-robin order."""

    active_masters = sorted(
        (master for master in masters if master.active and master.online),
        key=lambda master: (_sort_label(master.label), int(master.id)),
    )
    active_operators = sorted(
        (operator for operator in operators if operator.online),
        key=lambda operator: (_sort_label(operator.nickname), int(operator.id)),
    )

    assignments: list[DistributionAssignment] = []
    skipped: list[DistributionSkippedOperator] = []
    if not active_masters:
        return DistributionPlan(
            strategy="round_robin_active",
            skipped=[
                DistributionSkippedOperator(operator_id=operator.id, reason="no_online_master")
                for operator in active_operators
            ],
        )

    master_cursor = 0
    for operator in active_operators:
        selected: DistributionMaster | None = None
        for offset in range(len(active_masters)):
            index = (master_cursor + offset) % len(active_masters)
            candidate = active_masters[index]
            if _operator_allows_master(operator, candidate.id):
                selected = candidate
                master_cursor = (index + 1) % len(active_masters)
                break

        if selected is None:
            skipped.append(
                DistributionSkippedOperator(
                    operator_id=operator.id,
                    reason="no_allowed_online_master",
                )
            )
            continue

        assignments.append(
            DistributionAssignment(
                operator_id=operator.id,
                master_key_id=selected.id,
            )
        )

    return DistributionPlan(
        strategy="round_robin_active",
        assignments=assignments,
        skipped=skipped,
    )
