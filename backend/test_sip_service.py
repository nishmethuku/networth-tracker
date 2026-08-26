import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.sip_service import next_occurrences, project_future_value


def test_next_occurrences_monthly_from_future_start():
    result = next_occurrences(date(2026, 9, 1), "monthly", count=3, today=date(2026, 8, 13))
    assert result == ["2026-09-01", "2026-10-01", "2026-11-01"]


def test_next_occurrences_skips_past_dates():
    result = next_occurrences(date(2020, 1, 1), "monthly", count=2, today=date(2026, 8, 13))
    assert all(d >= "2026-08-13" for d in result)
    assert len(result) == 2


def test_next_occurrences_weekly():
    result = next_occurrences(date(2026, 8, 10), "weekly", count=2, today=date(2026, 8, 13))
    assert result == ["2026-08-17", "2026-08-24"]


def test_next_occurrences_handles_month_length_clamping():
    # Starting on the 31st, a 30-day February should clamp rather than crash
    result = next_occurrences(date(2026, 1, 31), "monthly", count=3, today=date(2026, 1, 31))
    assert result[0] == "2026-01-31"
    assert result[1].startswith("2026-02")
    assert result[2].startswith("2026-03")


def test_next_occurrences_unknown_frequency_returns_empty():
    assert next_occurrences(date(2026, 1, 1), "daily", count=3) == []


def test_project_future_value_grows_with_contributions_and_rate():
    result = project_future_value(current_value=10000, sip_amount=500, frequency="monthly", annual_rate=0.10, years=10)
    assert result["projected_value"] > 10000 + 500 * 120
    assert result["total_contributions"] == 60000.0
    assert result["assumed_annual_rate"] == 0.10


def test_project_future_value_uses_default_rate_when_none():
    result = project_future_value(current_value=0, sip_amount=100, frequency="monthly", annual_rate=None, years=1)
    assert result["assumed_annual_rate"] == 0.08


def test_project_future_value_zero_years_returns_current():
    result = project_future_value(current_value=5000, sip_amount=100, frequency="monthly", annual_rate=0.1, years=0)
    assert result["projected_value"] == 5000


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
