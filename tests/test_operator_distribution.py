from src.modules.operator_distribution.models import DistributionMaster, DistributionOperator
from src.modules.operator_distribution.strategies import round_robin_active


def test_round_robin_active_sorts_online_masters_and_operators_by_label():
    masters = [
        DistributionMaster(id=3, label="zeta", online=True),
        DistributionMaster(id=1, label="alpha", online=True),
        DistributionMaster(id=2, label="beta", online=False),
    ]
    operators = [
        DistributionOperator(id=12, nickname="gamma", online=True),
        DistributionOperator(id=10, nickname="alpha", online=True),
        DistributionOperator(id=11, nickname="beta", online=True),
    ]

    plan = round_robin_active(operators, masters)

    assert [(item.operator_id, item.master_key_id) for item in plan.assignments] == [
        (10, 1),
        (11, 3),
        (12, 1),
    ]
    assert plan.skipped == []


def test_round_robin_active_uses_only_online_masters():
    masters = [
        DistributionMaster(id=2, label="beta", online=False),
        DistributionMaster(id=1, label="alpha", online=True),
    ]
    operators = [
        DistributionOperator(id=10, nickname="alpha", online=True),
        DistributionOperator(id=11, nickname="beta", online=True),
    ]

    plan = round_robin_active(operators, masters)

    assert [(item.operator_id, item.master_key_id) for item in plan.assignments] == [
        (10, 1),
        (11, 1),
    ]


def test_round_robin_active_skips_when_no_master_has_online_stream():
    masters = [
        DistributionMaster(id=1, label="alpha", online=False),
        DistributionMaster(id=2, label="beta", online=False),
    ]
    operators = [
        DistributionOperator(id=10, nickname="alpha", online=True),
        DistributionOperator(id=11, nickname="beta", online=True),
    ]

    plan = round_robin_active(operators, masters)

    assert plan.assignments == []
    assert [(item.operator_id, item.reason) for item in plan.skipped] == [
        (10, "no_online_master"),
        (11, "no_online_master"),
    ]


def test_round_robin_active_skips_operator_when_no_allowed_master_matches():
    masters = [
        DistributionMaster(id=1, label="alpha", online=True),
        DistributionMaster(id=2, label="beta", online=True),
    ]
    operators = [
        DistributionOperator(id=10, nickname="alpha", online=True, allowed_master_ids=[2]),
        DistributionOperator(id=11, nickname="beta", online=True, allowed_master_ids=[99]),
    ]

    plan = round_robin_active(operators, masters)

    assert [(item.operator_id, item.master_key_id) for item in plan.assignments] == [(10, 2)]
    assert len(plan.skipped) == 1
    assert plan.skipped[0].operator_id == 11
    assert plan.skipped[0].reason == "no_allowed_online_master"


def test_distribution_service_collects_candidates_and_applies_plan():
    from src.modules.operator_distribution.service import DistributionDependencies, distribute_active_operators

    links = []
    deps = DistributionDependencies(
        list_keys=lambda company_id=None: [
            {"id": 2, "label": "beta", "active": True, "is_external": False, "is_master_key": True},
            {"id": 1, "label": "alpha", "active": True, "is_external": False, "is_master_key": True},
            {"id": 3, "label": "offline", "active": True, "is_external": False, "is_master_key": True},
        ],
        list_operators=lambda company_id=None: [
            {"id": 12, "nickname": "gamma", "online": False},
            {"id": 10, "nickname": "alpha", "online": True},
            {"id": 11, "nickname": "beta", "online": False},
        ],
        get_connected_streams=lambda: [
            {"api_key_id": 1},
            {"api_key_id": 2},
            {"api_key_id": -11},
        ],
        link_operator_to_master=lambda operator_id, master_key_id: links.append((operator_id, master_key_id)) or (99, []),
    )

    result = distribute_active_operators(deps=deps)

    assert links == [(10, 1), (11, 2)]
    assert result["strategy"] == "round_robin_active"
    assert result["applied_count"] == 2
    assert result["assignments"] == [
        {"operator_id": 10, "master_key_id": 1},
        {"operator_id": 11, "master_key_id": 2},
    ]
