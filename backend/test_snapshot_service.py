"""
Tests for snapshot_service._compute_totals -- specifically that it sums
gains in display currency, not each holding's native currency.
"""
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import snapshot_service


def test_compute_totals_sums_display_currency_gains_not_native_currency():
    """Regression: total_profit_loss summed the bare "total_gain"/"gain"
    fields, which stay in each holding's own currency -- a USD holding up
    $100 and an INR holding up ₹8300 (also $100 at an ~83 rate) should sum
    to $200, not 8400 (100 raw USD + 8300 raw INR added as if the same
    unit)."""
    usd_stock = {
        "asset_type": "stock", "display_value": 1000.0,
        "realized_gain": 0.0, "display_realized_gain": 0.0,
        "unrealized_gain": 100.0, "display_unrealized_gain": 100.0,
    }
    inr_stock = {
        "asset_type": "stock", "display_value": 500.0,
        "realized_gain": 0.0, "display_realized_gain": 0.0,
        # 8300 INR unrealized gain converts to 100 USD -- using the raw
        # "unrealized_gain" here would add 8300 instead of 100.
        "unrealized_gain": 8300.0, "display_unrealized_gain": 100.0,
    }
    inr_real_estate = {
        "asset_type": "real_estate", "display_value": 2000.0,
        "gain": 41500.0, "display_first_value": 1500.0,  # display gain = 2000 - 1500 = 500
    }

    with patch.object(snapshot_service, "list_holdings_with_metrics", return_value=[usd_stock, inr_stock, inr_real_estate]), \
         patch.object(snapshot_service, "total_liabilities_display", return_value=0.0):
        totals = snapshot_service._compute_totals(holdings=[], liabilities=[])

    assert totals["total_profit_loss"] == 700.0  # 100 + 100 + 500, all in display currency


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
