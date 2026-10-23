from datetime import date
from types import SimpleNamespace

from backend import budget_service
from backend.budget_service import plan_due_recurring, summarize_entries, summarize_year


def entry(d, amount, category="food", entry_type="expense", currency="USD", description=None, recurring=False, frequency=None):
    return SimpleNamespace(
        entry_date=d, amount=amount, category=category, entry_type=entry_type, currency=currency,
        description=description, is_recurring=recurring, recurring_frequency=frequency,
    )


def limit(category="food", monthly=100.0, rollover=False, currency="USD"):
    return {"category": category, "monthly_limit": monthly, "currency": currency, "rollover": rollover}


def test_limit_without_rollover_is_unchanged():
    entries = [entry(date(2026, 9, 5), 40), entry(date(2026, 10, 5), 30)]
    status = summarize_entries(entries, limits=[limit()])["limit_status"][0]
    assert status["limit"] == 100.0
    assert status["carried_over"] == 0.0
    assert status["percent"] == 30.0


def test_rollover_adds_last_months_unspent_amount():
    entries = [entry(date(2026, 9, 5), 40), entry(date(2026, 10, 5), 30)]
    status = summarize_entries(entries, limits=[limit(rollover=True)])["limit_status"][0]
    assert status["carried_over"] == 60.0
    assert status["limit"] == 160.0
    assert status["base_limit"] == 100.0
    assert status["percent"] == round(30 / 160 * 100, 1)


def test_rollover_never_carries_more_than_one_months_limit_or_a_negative():
    under = [entry(date(2026, 9, 5), 0.0), entry(date(2026, 10, 5), 10)]
    assert summarize_entries(under, limits=[limit(rollover=True)])["limit_status"][0]["carried_over"] == 100.0
    over = [entry(date(2026, 9, 5), 250), entry(date(2026, 10, 5), 10)]
    assert summarize_entries(over, limits=[limit(rollover=True)])["limit_status"][0]["carried_over"] == 0.0


def test_rollover_needs_entries_last_month():
    entries = [entry(date(2026, 8, 5), 10), entry(date(2026, 10, 5), 30)]
    assert summarize_entries(entries, limits=[limit(rollover=True)])["limit_status"][0]["carried_over"] == 0.0


def test_rollover_crosses_a_year_boundary():
    entries = [entry(date(2025, 12, 5), 40), entry(date(2026, 1, 5), 30)]
    assert summarize_entries(entries, limits=[limit(rollover=True)])["limit_status"][0]["carried_over"] == 60.0


def test_summarize_year_totals_months_categories_and_comparison():
    entries = [
        entry(date(2026, 1, 5), 100, "housing"),
        entry(date(2026, 1, 9), 50, "food"),
        entry(date(2026, 3, 2), 300, "housing"),
        entry(date(2026, 3, 3), 900, "CC-payment"),
        entry(date(2026, 2, 1), 4000, "paycheck", "income"),
        entry(date(2026, 4, 1), 80, "food", currency="INR"),
        entry(date(2025, 6, 1), 200, "food"),
    ]
    y = summarize_year(entries, 2026)
    assert y["total_spent"] == 450.0
    assert y["total_income"] == 4000.0
    assert y["months"][0]["expenses"] == 150.0
    assert len(y["months"]) == 12
    assert y["top_categories"][0] == {"category": "housing", "amount": 400.0}
    assert y["biggest_month"]["month"] == "2026-03"
    assert y["average_month"] == 225.0
    assert y["last_year_spent"] == 200.0


def test_summarize_year_with_nothing():
    y = summarize_year([], 2026)
    assert y["total_spent"] == 0.0
    assert y["biggest_month"] is None
    assert y["last_year_spent"] is None


def test_plan_due_recurring_logs_one_period_after_the_latest_entry():
    rent = entry(date(2026, 9, 1), 1000, "housing", description="Rent", recurring=True, frequency="monthly")
    plan = plan_due_recurring([rent], date(2026, 10, 23))
    assert [p["entry_date"] for p in plan] == [date(2026, 10, 1)]


def test_plan_due_recurring_catches_up_but_stops_at_three_and_at_today():
    rent = entry(date(2026, 1, 1), 1000, "housing", description="Rent", recurring=True, frequency="monthly")
    plan = plan_due_recurring([rent], date(2026, 10, 23))
    assert [p["entry_date"] for p in plan] == [date(2026, 2, 1), date(2026, 3, 1), date(2026, 4, 1)]
    nothing = plan_due_recurring([entry(date(2026, 10, 10), 5, description="Gym", recurring=True, frequency="monthly")], date(2026, 10, 23))
    assert nothing == []


def test_plan_due_recurring_uses_the_latest_entry_so_a_second_run_adds_nothing():
    first = entry(date(2026, 8, 1), 1000, "housing", description="Rent", recurring=True, frequency="monthly")
    second = entry(date(2026, 9, 1), 1000, "housing", description="rent", recurring=True, frequency="monthly")
    plan = plan_due_recurring([first, second], date(2026, 10, 23))
    assert [p["entry_date"] for p in plan] == [date(2026, 10, 1)]


def test_plan_due_recurring_ignores_non_recurring_and_unknown_frequencies():
    assert plan_due_recurring([entry(date(2026, 8, 1), 5)], date(2026, 10, 23)) == []
    odd = entry(date(2026, 8, 1), 5, description="x", recurring=True, frequency="fortnightly")
    assert plan_due_recurring([odd], date(2026, 10, 23)) == []


def test_previous_month_helper():
    assert budget_service._previous_month("2026-01") == "2025-12"
    assert budget_service._previous_month("2026-10") == "2026-09"
