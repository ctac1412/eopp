from types import SimpleNamespace

import src.db.usage_log  # noqa: F401
from src.services import usage_service


def test_usage_response_resolves_company_name_from_company_aliases(monkeypatch):
    record = SimpleNamespace(
        id=1,
        api_key_id=10,
        reservation_id="reservation",
        status="confirmed",
        error_message=None,
        error_stage=None,
        slot_date=None,
        logs=None,
        config_json=None,
        created_at="2026-06-15T00:00:00+00:00",
        confirmed_at=None,
        api_key=None,
        price=1000,
        paid=None,
        op_type="create",
        company="Хип-Хоп Транс Дэнс",
        company_id=None,
        company_rel=None,
        fio=None,
        vehicle_number=None,
        is_test=False,
        has_custom_slots=False,
        invoice_id=None,
    )

    def find_company_by_name_or_alias(value):
        assert value == "Хип-Хоп Транс Дэнс"
        return SimpleNamespace(name='ООО "АРТ-ТРАНС"')

    monkeypatch.setattr(
        usage_service.company_repo,
        "find_company_by_name_or_alias",
        find_company_by_name_or_alias,
    )

    assert usage_service._usage_to_dict(record)["company_name"] == 'ООО "АРТ-ТРАНС"'
