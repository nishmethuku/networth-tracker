import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.budget_service import summarize_entries
from backend.models import BudgetEntry


def _entry(entry_type, entry_date, amount, category, currency="USD"):
    return BudgetEntry(
        user_id="00000000-0000-0000-0000-000000000000",
        entry_type=entry_type,
        entry_date=entry_date,
        amount=amount,
        currency=currency,
        category=category,
    )


def test_sums_income_and_expenses_per_month():
    entries = [
        _entry("income", date(2026, 3, 1), 6200, "paycheck"),
        _entry("expense", date(2026, 3, 5), 1800, "housing"),
        _entry("expense", date(2026, 3, 10), 620, "food"),
    ]
    result = summarize_entries(entries)
    assert result["months"] == [{"month": "2026-03", "income": 6200.0, "expenses": 2420.0, "net": 3780.0}]


def test_category_breakdown_covers_only_the_latest_month_expenses():
    entries = [
        _entry("expense", date(2026, 2, 1), 500, "food"),
        _entry("income", date(2026, 3, 1), 1000, "paycheck"),
        _entry("expense", date(2026, 3, 1), 300, "food"),
        _entry("expense", date(2026, 3, 2), 200, "transport"),
    ]
    result = summarize_entries(entries)
    assert result["latest_month"] == "2026-03"
    assert result["category_breakdown"] == [
        {"category": "food", "amount": 300.0},
        {"category": "transport", "amount": 200.0},
    ]


def test_limits_to_the_trailing_n_months():
    entries = [_entry("income", date(2026, m, 1), 100, "paycheck") for m in range(1, 7)]
    result = summarize_entries(entries, months=3)
    assert [m["month"] for m in result["months"]] == ["2026-04", "2026-05", "2026-06"]


def test_separates_entries_in_a_different_currency():
    entries = [
        _entry("income", date(2026, 3, 1), 1000, "paycheck", currency="USD"),
        _entry("income", date(2026, 3, 1), 5000, "paycheck", currency="INR"),
    ]
    result = summarize_entries(entries, currency="USD")
    assert result["months"][0]["income"] == 1000.0
    assert result["other_currency_entries"] == 1


def test_empty_entries_returns_empty_summary():
    result = summarize_entries([])
    assert result["months"] == []
    assert result["latest_month"] is None
    assert result["category_breakdown"] == []


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
