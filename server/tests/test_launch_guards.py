from src.services.launch_guards import validate_launch_config


def test_run_up_to_5_allows_zabaikalsk_and_test_facility():
    assert validate_launch_config({
        "runUpTo": 5,
        "facilityId": "1dae5b1c-e2b3-44a4-848f-df8ce2ddde42",
    }) is None
    assert validate_launch_config({
        "runUpTo": 5,
        "facilityId": "facility-1",
    }) is None


def test_run_up_to_5_rejects_other_facility():
    error = validate_launch_config({
        "runUpTo": 5,
        "facilityId": "93c9939a-2182-4e78-98b4-0cf314b09cfa",
    })
    assert error is not None
    assert error["error"] == "launch_guard_failed"
