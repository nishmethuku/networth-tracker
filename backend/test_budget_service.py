import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.budget_service import summarize_entries, summarize_subscriptions
from backend.models import BudgetEntry


def _entry(entry_type, entry_date, amount, category, currency="USD", is_recurring=False, recurring_frequency=None, description=None):
    return BudgetEntry(
        user_id="00000000-0000-0000-0000-000000000000",
        entry_type=entry_type,
        entry_date=entry_date,
        amount=amount,
        currency=currency,
        category=category,
        is_recurring=is_recurring,
        recurring_frequency=recurring_frequency,
        description=description,
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


def test_limit_status_reports_spend_vs_limit_for_latest_month():
    entries = [_entry("expense", date(2026, 3, 1), 450, "food")]
    limits = [{"category": "food", "monthly_limit": 600, "currency": "USD"}]
    result = summarize_entries(entries, limits=limits)
    assert result["limit_status"] == [{"category": "food", "limit": 600, "spent": 450.0, "percent": 75.0}]


def test_limit_status_ignores_limits_in_a_different_currency():
    entries = [_entry("expense", date(2026, 3, 1), 450, "food", currency="USD")]
    limits = [{"category": "food", "monthly_limit": 600, "currency": "INR"}]
    result = summarize_entries(entries, currency="USD", limits=limits)
    assert result["limit_status"] == []


def test_limit_status_empty_without_limits():
    entries = [_entry("expense", date(2026, 3, 1), 450, "food")]
    result = summarize_entries(entries)
    assert result["limit_status"] == []


def test_summarize_subscriptions_uses_most_recent_entry_per_group():
    entries = [
        _entry("expense", date(2026, 1, 1), 12.99, "entertainment", is_recurring=True, recurring_frequency="monthly", description="Netflix"),
        _entry("expense", date(2026, 2, 1), 15.99, "entertainment", is_recurring=True, recurring_frequency="monthly", description="Netflix"),
    ]
    result = summarize_subscriptions(entries)
    assert len(result["items"]) == 1
    assert result["items"][0]["amount"] == 15.99


def test_summarize_subscriptions_computes_monthly_equivalent_total():
    entries = [
        _entry("expense", date(2026, 1, 1), 120, "entertainment", is_recurring=True, recurring_frequency="yearly", description="Prime"),
        _entry("expense", date(2026, 1, 1), 15, "entertainment", is_recurring=True, recurring_frequency="monthly", description="Spotify"),
    ]
    result = summarize_subscriptions(entries)
    # 120/year -> 10/month equivalent, plus 15/month = 25
    assert result["monthly_total"] == 25.0


def test_summarize_subscriptions_defaults_missing_frequency_to_monthly():
    entries = [_entry("expense", date(2026, 1, 1), 50, "housing", is_recurring=True, recurring_frequency=None, description="Rent")]
    result = summarize_subscriptions(entries)
    assert result["items"][0]["frequency"] == "monthly"


def test_summarize_subscriptions_empty_without_entries():
    result = summarize_subscriptions([])
    assert result["items"] == []
    assert result["monthly_total"] == 0.0


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
