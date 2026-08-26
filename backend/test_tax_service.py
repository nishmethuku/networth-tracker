"""
Tax summary financial-year bucketing tests.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.tax_service import financial_year_label


def test_india_fy_before_april_belongs_to_previous_fy():
    # Feb 2025 is in FY2024-25 (Apr 2024 - Mar 2025)
    assert financial_year_label(date(2025, 2, 15), "India") == "FY2024-25"


def test_india_fy_on_or_after_april_belongs_to_new_fy():
    assert financial_year_label(date(2024, 4, 1), "India") == "FY2024-25"
    assert financial_year_label(date(2024, 12, 31), "India") == "FY2024-25"


def test_us_uses_calendar_year():
    assert financial_year_label(date(2024, 1, 1), "United States") == "2024"
    assert financial_year_label(date(2024, 12, 31), "United States") == "2024"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
