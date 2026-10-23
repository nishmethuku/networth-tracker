import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import budget_service
from backend.budget_service import most_recent_entry_date, summarize_entries, summarize_subscriptions
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


def test_months_zero_returns_no_months_not_every_month():
    # Regression: sorted(...)[-months:] with months=0 slices to [0:] --
    # every month, not none. months is client-controlled (?months= on
    # /budget/summary, unvalidated), so 0 is reachable.
    entries = [_entry("income", date(2026, m, 1), 100, "paycheck") for m in range(1, 7)]
    result = summarize_entries(entries, months=0)
    assert result["months"] == []


def test_negative_months_returns_no_months_not_a_front_dropped_slice():
    entries = [_entry("income", date(2026, m, 1), 100, "paycheck") for m in range(1, 7)]
    result = summarize_entries(entries, months=-1)
    assert result["months"] == []


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
    assert result["limit_status"] == [
        {"category": "food", "limit": 600, "base_limit": 600, "carried_over": 0.0, "rollover": False, "spent": 450.0, "percent": 75.0}
    ]


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


def test_summarize_subscriptions_does_not_merge_distinct_undescribed_entries():
    """Regression test: two different subscriptions in the same category
    that both have no description used to group under the same (category,
    description) key, silently merging into one -- the smaller one just
    vanished from the list and monthly_total undercounted the household's
    real recurring spend. Description-less entries now also key on amount
    so two genuinely different subscriptions don't collide."""
    entries = [
        _entry("expense", date(2026, 1, 1), 15.99, "entertainment", is_recurring=True, recurring_frequency="monthly"),
        _entry("expense", date(2026, 1, 2), 9.99, "entertainment", is_recurring=True, recurring_frequency="monthly"),
    ]
    result = summarize_subscriptions(entries)
    assert len(result["items"]) == 2
    assert result["monthly_total"] == 25.98


def test_summarize_subscriptions_still_merges_same_description_across_months():
    """Sanity check alongside the fix above: re-logging the same named
    subscription (even at a changed amount, e.g. a price increase) must
    still collapse to its latest entry -- the amount-based fallback key
    only kicks in when description is blank."""
    entries = [
        _entry("expense", date(2026, 1, 1), 2000.0, "housing", is_recurring=True, recurring_frequency="monthly", description="Rent"),
        _entry("expense", date(2026, 2, 1), 2100.0, "housing", is_recurring=True, recurring_frequency="monthly", description="Rent"),
    ]
    result = summarize_subscriptions(entries)
    assert len(result["items"]) == 1
    assert result["items"][0]["amount"] == 2100.0


def test_most_recent_entry_date_returns_the_latest_entry_date():
    latest_entry = MagicMock(entry_date=date(2026, 8, 20))
    mock_query = MagicMock()
    mock_query.filter_by.return_value.order_by.return_value.first.return_value = latest_entry

    with patch.object(budget_service, "BudgetEntry") as mock_model:
        mock_model.query = mock_query
        mock_model.entry_date.desc = MagicMock(return_value="desc")
        result = most_recent_entry_date(user_id="u1")

    assert result == date(2026, 8, 20)
    mock_query.filter_by.assert_called_once_with(user_id="u1")


def test_most_recent_entry_date_returns_none_when_nothing_logged():
    mock_query = MagicMock()
    mock_query.filter_by.return_value.order_by.return_value.first.return_value = None

    with patch.object(budget_service, "BudgetEntry") as mock_model:
        mock_model.query = mock_query
        result = most_recent_entry_date(user_id="u1")

    assert result is None


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])


def test_card_payment_categories_are_not_counted_as_spending():
    entries = [
        _entry("income", date(2026, 9, 1), 5000, "paycheck"),
        _entry("expense", date(2026, 9, 2), 100, "food"),
        _entry("expense", date(2026, 9, 3), 900, "CC-payment"),
        _entry("expense", date(2026, 9, 4), 50, "cc payments"),
    ]
    result = summarize_entries(entries, months=6, currency="USD")
    assert result["months"][0]["expenses"] == 100
    assert [c["category"] for c in result["category_breakdown"]] == ["food"]


def test_is_non_spending_category_only_matches_card_payment_names():
    assert budget_service.is_non_spending_category("CC-payment")
    assert budget_service.is_non_spending_category("credit_card_payment")
    assert not budget_service.is_non_spending_category("food")
    assert not budget_service.is_non_spending_category(None)


def test_breakdown_rows_carry_their_parent_category():
    entries = [
        _entry("expense", date(2026, 9, 2), 60, "cellphone"),
        _entry("expense", date(2026, 9, 3), 100, "utilities"),
        _entry("expense", date(2026, 9, 4), 20, "food"),
    ]
    result = summarize_entries(entries, months=6, currency="USD", parents={"cellphone": "utilities"})
    rows = {r["category"]: r for r in result["category_breakdown"]}
    assert rows["cellphone"]["parent"] == "utilities"
    assert "parent" not in rows["utilities"]
    assert "parent" not in rows["food"]


class _FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


def _fake_category(name, parent=None):
    return type("C", (), {"name": name, "parent": parent})()


def _create(name, parent, custom_rows):
    from unittest.mock import patch as _patch

    with _patch.object(budget_service, "_custom_categories_query", return_value=_FakeQuery(custom_rows)), \
         _patch.object(budget_service.db.session, "add"), _patch.object(budget_service.db.session, "commit"), \
         _patch.object(budget_service.BudgetCategory, "to_dict", lambda self: {"name": self.name, "parent": self.parent}):
        return budget_service.create_category("u1", "expense", name, parent=parent)


def test_create_category_can_sit_inside_a_preset_or_custom_parent():
    assert _create("Cellphone", "utilities", [])["parent"] == "utilities"
    assert _create("Mobile data", "Cellphone", [_fake_category("Cellphone")])["parent"] == "Cellphone"


def test_create_category_rejects_unknown_self_and_deeply_nested_parents():
    import pytest

    with pytest.raises(ValueError):
        _create("Pets", "nope", [])
    with pytest.raises(ValueError):
        _create("Pets", "pets", [])
    with pytest.raises(ValueError):
        _create("Deep", "Cellphone", [_fake_category("Cellphone", parent="utilities")])
