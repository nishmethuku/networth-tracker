from datetime import date

from backend.income_service import summarize_income

TODAY = date(2026, 10, 21)


def ev(d, amount, hid=1, name="VTI", symbol="VTI", kind="dividend"):
    return {"date": d, "amount": amount, "holding_id": hid, "name": name, "symbol": symbol, "type": kind}


def test_empty_gives_zero_totals_and_twelve_empty_months():
    out = summarize_income([], {}, TODAY)
    assert out["total"] == 0 and out["last_12_months"] == 0 and out["yield_pct"] is None
    assert len(out["by_month"]) == 12
    assert out["by_month"][0]["month"] == "2025-11" and out["by_month"][-1]["month"] == "2026-10"


def test_groups_by_year_month_and_holding():
    events = [ev(date(2026, 10, 1), 30), ev(date(2026, 7, 1), 20), ev(date(2025, 3, 1), 10, hid=2, name="BND", symbol="BND")]
    out = summarize_income(events, {1: 1000, 2: 500}, TODAY)
    assert out["total"] == 60
    assert [r["year"] for r in out["by_year"]] == [2026, 2025]
    assert out["by_year"][0]["amount"] == 50
    assert out["by_month"][-1]["amount"] == 30
    assert out["by_holding"][0]["symbol"] == "VTI" and out["by_holding"][0]["total"] == 50


def test_yield_uses_only_last_12_months_and_paying_holdings():
    events = [ev(date(2026, 6, 1), 50), ev(date(2024, 6, 1), 999)]
    out = summarize_income(events, {1: 1000}, TODAY)
    assert out["last_12_months"] == 50
    assert round(out["yield_pct"], 2) == 5.0


def test_sold_holding_counts_in_totals_but_not_yield():
    out = summarize_income([ev(date(2026, 6, 1), 50)], {}, TODAY)
    assert out["last_12_months"] == 50 and out["yield_pct"] is None


def test_income_exactly_one_year_ago_is_excluded_from_last_12():
    out = summarize_income([ev(date(2025, 10, 21), 40)], {1: 1000}, TODAY)
    assert out["total"] == 40 and out["last_12_months"] == 0
