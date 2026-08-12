"""
Minimal tests to prove financial correctness
Focus: Summary calculations and CAGR
"""

import sys
import os
from datetime import date, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services import calculate_asset_metrics, safe_float
from backend.finance import calculate_cagr


def test_safe_float_handles_none():
    """safe_float should handle None gracefully"""
    assert safe_float(None) == 0.0


def test_safe_float_handles_strings():
    """safe_float should convert strings to floats"""
    assert safe_float("123.45") == 123.45
    assert safe_float("0") == 0.0


def test_safe_float_handles_invalid():
    """safe_float should default to 0.0 for invalid input"""
    assert safe_float("invalid") == 0.0
    assert safe_float({}) == 0.0


def test_cagr_calculation_basic():
    """CAGR should calculate correctly for simple case"""
    # $100 invested 2 years ago, now worth $121 (21% return)
    # CAGR should be approximately 10% per year (sqrt(121/100) - 1 ≈ 0.1)
    buy_value = 100.0
    current_value = 121.0
    purchase_date = date.today() - timedelta(days=730)  # 2 years ago

    cagr = calculate_cagr(buy_value, current_value, purchase_date)
    # Should be approximately 10% (0.1)
    assert abs(cagr - 0.1) < 0.02  # Allow small margin for calculation


def test_cagr_handles_zero_buy_value():
    """CAGR should return 0.0 for zero buy value"""
    cagr = calculate_cagr(0.0, 100.0, date.today() - timedelta(days=365))
    assert cagr == 0.0


def test_cagr_handles_zero_current_value():
    """CAGR should return 0.0 for zero current value"""
    # Based on the finance.py logic, if current_value <= 0, it returns 0.0
    cagr = calculate_cagr(100.0, 0.0, date.today() - timedelta(days=365))
    assert cagr == 0.0


def test_cagr_handles_negative_values():
    """CAGR should handle negative values by using absolute values"""
    # Negative buy value (loan) - CAGR uses abs()
    buy_value = -100.0
    current_value = -110.0  # Loan increased (more debt)
    purchase_date = date.today() - timedelta(days=365)

    cagr = calculate_cagr(buy_value, current_value, purchase_date)
    # Should calculate based on absolute values, result should be positive
    assert cagr > 0


def test_cagr_one_year_doubling():
    """CAGR should be 100% if value doubles in 1 year"""
    buy_value = 100.0
    current_value = 200.0
    purchase_date = date.today() - timedelta(days=365)

    cagr = calculate_cagr(buy_value, current_value, purchase_date)
    # Should be approximately 100% (1.0)
    assert abs(cagr - 1.0) < 0.1  # Allow margin


def test_profit_calculation_stock():
    """Profit should be current_value - buy_value for stocks"""
    from unittest.mock import patch, MagicMock
    from backend.models import Asset

    # Create a mock asset
    asset = Asset(
        asset_type="stock",
        country="US",
        account="Test",
        purchase_date=date.today() - timedelta(days=365),
        symbol="AAPL",
        units=10.0,
        buy_price=100.0,
    )

    # Mock get_current_stock_price to return 110.0
    with patch("backend.services.get_current_stock_price", return_value=110.0):
        metrics = calculate_asset_metrics(asset)

        # Expected: buy_value = 10 * 100 = 1000, current_value = 10 * 110 = 1100
        assert abs(metrics["buy_value"] - 1000.0) < 0.01
        assert abs(metrics["current_value"] - 1100.0) < 0.01
        assert abs(metrics["profit"] - 100.0) < 0.01


def test_profit_percentage_calculation():
    """Profit percentage should calculate correctly"""
    from backend.models import Asset

    asset = Asset(
        asset_type="cash",
        country="US",
        account="Test",
        purchase_date=date.today() - timedelta(days=365),
        value=1000.0,
    )

    metrics = calculate_asset_metrics(asset)

    # For cash, buy_value = current_value = 1000, profit = 0
    assert metrics["profit"] == 0.0
    assert metrics["profit_pct"] == 0.0


def test_loan_negative_values():
    """Loans should have negative values"""
    from backend.models import Asset

    asset = Asset(
        asset_type="loan",
        country="US",
        account="Test",
        purchase_date=date.today() - timedelta(days=365),
        value=5000.0,  # $5000 loan
    )

    metrics = calculate_asset_metrics(asset)

    # Loan should have negative buy_value and current_value
    assert metrics["buy_value"] == -5000.0
    assert metrics["current_value"] == -5000.0
    assert metrics["profit"] == 0.0


def test_division_by_zero_protection():
    """Should handle zero buy_value without division errors"""
    from backend.models import Asset

    asset = Asset(
        asset_type="cash",
        country="US",
        account="Test",
        purchase_date=date.today() - timedelta(days=365),
        value=0.0,  # Zero value
    )

    metrics = calculate_asset_metrics(asset)

    # Should not crash, profit_pct should be 0
    assert metrics["buy_value"] == 0.0
    assert metrics["current_value"] == 0.0
    assert metrics["profit_pct"] == 0.0
    assert metrics["cagr"] == 0.0


def test_real_estate_current_value_fallback():
    """Real estate should use buy_value if current_value not set"""
    from backend.models import Asset

    asset = Asset(
        asset_type="real_estate",
        country="US",
        account="Test",
        purchase_date=date.today() - timedelta(days=365),
        buy_value=200000.0,
        current_value=None,  # Not set
    )

    metrics = calculate_asset_metrics(asset)

    # Should use buy_value as current_value fallback
    assert metrics["buy_value"] == 200000.0
    assert metrics["current_value"] == 200000.0
    assert metrics["profit"] == 0.0


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
