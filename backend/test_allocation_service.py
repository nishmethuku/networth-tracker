import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from backend.allocation_service import compute_rebalance_plan, validate_target_allocation


def test_validate_target_allocation_accepts_100_total():
    validate_target_allocation({"stock": 60, "cash": 40})


def test_validate_target_allocation_rejects_non_100_total():
    with pytest.raises(ValueError):
        validate_target_allocation({"stock": 60, "cash": 30})


def test_validate_target_allocation_rejects_negative():
    with pytest.raises(ValueError):
        validate_target_allocation({"stock": 110, "cash": -10})


def test_validate_target_allocation_rejects_empty():
    with pytest.raises(ValueError):
        validate_target_allocation({})


def test_compute_rebalance_plan_flags_buy_and_sell():
    allocation_by_type = [
        {"label": "stock", "value": 8000.0},
        {"label": "cash", "value": 2000.0},
    ]
    plan = compute_rebalance_plan(allocation_by_type, 10000.0, {"stock": 60, "cash": 40})

    by_type = {p["asset_type"]: p for p in plan}
    assert by_type["stock"]["action"] == "sell"
    assert by_type["stock"]["amount"] == pytest.approx(2000.0)
    assert by_type["cash"]["action"] == "buy"
    assert by_type["cash"]["amount"] == pytest.approx(2000.0)


def test_compute_rebalance_plan_includes_target_only_type_as_buy():
    allocation_by_type = [{"label": "stock", "value": 10000.0}]
    plan = compute_rebalance_plan(allocation_by_type, 10000.0, {"stock": 80, "crypto": 20})

    by_type = {p["asset_type"]: p for p in plan}
    assert by_type["crypto"]["current_value"] == 0.0
    assert by_type["crypto"]["action"] == "buy"
    assert by_type["crypto"]["amount"] == pytest.approx(2000.0)


def test_compute_rebalance_plan_holds_when_already_at_target():
    allocation_by_type = [{"label": "stock", "value": 10000.0}]
    plan = compute_rebalance_plan(allocation_by_type, 10000.0, {"stock": 100})
    assert plan[0]["action"] == "hold"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
