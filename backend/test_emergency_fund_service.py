"""
Tests for emergency_fund_service.get_emergency_fund_status -- specifically
that liquid_value and avg_monthly_expenses are computed on the same
(fully currency-converted) basis.
"""
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import emergency_fund_service


def _entry(entry_type, entry_date, amount, currency="USD"):
    e = MagicMock(entry_type=entry_type, amount=amount, currency=currency)
    e.entry_date = entry_date
    return e


def test_avg_monthly_expenses_converts_every_currency_not_just_the_display_one():
    """Regression: avg_monthly_expenses previously came from
    budget_service.get_monthly_summary, which only sums entries already
    logged in the display currency and silently drops the rest -- while
    liquid_value (via list_holdings_with_metrics) is fully converted. A
    user with mostly-INR spending and a little USD spending, viewing in
    USD, would get an avg_monthly_expenses of only the USD slice, wildly
    inflating months_covered."""
    cash_holding = MagicMock(asset_type="cash")

    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.filter.return_value.all.return_value = [cash_holding]

    entries = [
        _entry("expense", date(2026, 8, 1), 500.0, currency="USD"),
        _entry("expense", date(2026, 8, 5), 166000.0, currency="INR"),  # ~2000 USD at an 83 rate
    ]
    mock_entry_query = MagicMock()
    mock_entry_query.filter_by.return_value.filter_by.return_value.all.return_value = entries

    def fake_convert(amount, from_ccy, to_ccy):
        return amount / 83.0 if from_ccy == "INR" else amount

    with patch.object(emergency_fund_service, "Holding") as mock_holding_model, \
         patch.object(emergency_fund_service, "BudgetEntry") as mock_entry_model, \
         patch.object(emergency_fund_service, "list_holdings_with_metrics", return_value=[{"display_value": 10000.0}]), \
         patch.object(emergency_fund_service, "price_service") as mock_price_service:
        mock_holding_model.query = mock_holding_query
        mock_entry_model.query = mock_entry_query
        mock_price_service.convert.side_effect = fake_convert

        result = emergency_fund_service.get_emergency_fund_status(user_id="u1", currency="USD")

    # 500 USD + (166000 / 83) USD = 2500 USD for the one month with entries.
    assert result["avg_monthly_expenses"] == 2500.0
    assert result["liquid_value"] == 10000.0
    assert result["months_covered"] == 4.0  # 10000 / 2500, not 10000 / 500 = 20


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
