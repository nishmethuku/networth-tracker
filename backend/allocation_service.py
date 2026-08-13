"""
Rebalance math for the allocation advisor. Pure, deterministic Python — no
AI involved here; ai_service.generate_allocation_narrative narrates the
result separately. Deltas are computed in display-currency amount per asset
type (not per-holding units), since a single asset type commonly spans
several holdings in different native currencies.
"""
from typing import Dict, List


def validate_target_allocation(target_allocation: Dict[str, float]) -> None:
    total = sum(target_allocation.values())
    if not target_allocation:
        raise ValueError("target_allocation must not be empty")
    if any(pct < 0 for pct in target_allocation.values()):
        raise ValueError("target_allocation percentages must be non-negative")
    if abs(total - 100.0) > 0.5:
        raise ValueError(f"target_allocation percentages must sum to 100 (got {total:.1f})")


def compute_rebalance_plan(
    allocation_by_type: List[Dict], total_net_worth: float, target_allocation: Dict[str, float]
) -> List[Dict]:
    current = {a["label"]: a["value"] for a in allocation_by_type}
    all_types = sorted(set(current) | set(target_allocation))

    plan = []
    for asset_type in all_types:
        current_value = current.get(asset_type, 0.0)
        current_pct = (current_value / total_net_worth * 100.0) if total_net_worth else 0.0
        target_pct = target_allocation.get(asset_type, 0.0)
        target_value = total_net_worth * (target_pct / 100.0)
        delta = target_value - current_value

        plan.append({
            "asset_type": asset_type,
            "current_value": round(current_value, 2),
            "current_pct": round(current_pct, 2),
            "target_pct": round(target_pct, 2),
            "target_value": round(target_value, 2),
            "action": "buy" if delta > 1 else ("sell" if delta < -1 else "hold"),
            "amount": round(abs(delta), 2),
        })

    plan.sort(key=lambda p: -p["amount"])
    return plan
