import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.sip_service import _advance, next_occurrences, project_future_value


def _brute_force_next_occurrence(start_date, frequency, today):
    """Ground truth for next_occurrences' fast-forward heuristic: walk one
    period at a time (slow, but exact) until reaching >= today."""
    n = 0
    current = start_date
    while current < today:
        n += 1
        current = _advance(start_date, frequency, n)
    return current


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


def test_next_occurrences_long_running_monthly_sip_does_not_skip_the_true_next_date():
    # Regression: the fast-forward heuristic approximates elapsed periods
    # using a fixed 30-day month, but _advance moves by real calendar
    # months (~30.44 days average) -- the drift compounds with age, and
    # for a 20-year-old monthly SIP it overshot by a full period, silently
    # skipping the actual next occurrence. A flat "-1" period safety
    # margin doesn't scale with how long the SIP has been running.
    start = date(2006, 1, 15)
    today = date(2026, 8, 26)
    true_next = _brute_force_next_occurrence(start, "monthly", today)
    assert next_occurrences(start, "monthly", count=1, today=today) == [true_next.isoformat()]


def test_next_occurrences_matches_brute_force_across_ages_and_frequencies():
    today = date(2026, 8, 26)
    for frequency in ("weekly", "monthly", "quarterly", "yearly"):
        for years_ago in (1, 5, 20, 40, 80):
            start = date(today.year - years_ago, 3, 17)
            expected = _brute_force_next_occurrence(start, frequency, today).isoformat()
            actual = next_occurrences(start, frequency, count=1, today=today)
            assert actual == [expected], f"{frequency}, {years_ago}yr: expected {expected}, got {actual}"


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
