from datetime import date

from backend.email_service import render_monthly_email
from backend.monthly_report_service import report_month, summarize_month


def test_report_month_is_the_previous_calendar_month():
    m = report_month(date(2026, 11, 1))
    assert m["label"] == "October 2026" and m["key"] == "2026-10"
    assert m["first_day"] == date(2026, 10, 1) and m["last_day"] == date(2026, 10, 31)


def test_report_month_across_a_year_boundary():
    m = report_month(date(2027, 1, 1))
    assert m["key"] == "2026-12" and m["last_day"] == date(2026, 12, 31)


def test_change_and_percent():
    s = summarize_month(1100.0, 1000.0, 5.0, [])
    assert s["change"] == 100.0 and s["change_pct"] == 10.0 and s["income"] == 5.0


def test_no_starting_snapshot_means_no_change():
    s = summarize_month(1100.0, None, 0.0, [])
    assert s["change"] is None and s["change_pct"] is None


def test_zero_start_has_change_but_no_percent():
    s = summarize_month(50.0, 0.0, 0.0, [])
    assert s["change"] == 50.0 and s["change_pct"] is None


def test_top_holdings_and_concentration():
    holdings = [
        {"name": "Amazon", "symbol": "AMZN", "display_value": 800},
        {"name": "Tesla", "symbol": "TSLA", "display_value": 150},
        {"name": "Cash", "symbol": None, "display_value": 50},
        {"name": "Loan-ish", "display_value": -10},
    ]
    s = summarize_month(1000.0, 900.0, 0.0, holdings)
    assert [h["name"] for h in s["top_holdings"]] == ["AMZN", "TSLA", "Cash"]
    assert s["concentration"] == {"name": "AMZN", "pct": 80.0}


def test_no_concentration_when_spread_out():
    holdings = [{"name": n, "display_value": 100} for n in "ABCDE"]
    assert summarize_month(500.0, 400.0, 0.0, holdings)["concentration"] is None


def test_email_escapes_holding_names_and_shows_figures():
    report = {
        "month_label": "October 2026",
        "net_worth": 1234.5,
        "change": -20.0,
        "change_pct": -1.6,
        "income": 12.0,
        "top_holdings": [{"name": "<script>x</script>", "value": 100.0, "pct": 50.0}],
        "concentration": {"name": "<b>AMZN</b>", "pct": 80.0},
    }
    html = render_monthly_email(report, name="Nish")
    assert "<script>" not in html and "<b>AMZN</b>" not in html
    assert "&lt;script&gt;" in html
    assert "$1,234.50" in html and "-$20.00 (-1.6%)" in html and "Hi Nish" in html
