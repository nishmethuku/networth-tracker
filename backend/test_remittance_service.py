from datetime import date, timedelta

import pytest

from .remittance_service import clean, summarize


def row(**kw):
    base = {
        "sent_date": "2026-03-10", "recipient": "Mom", "amount_sent": 500, "currency_sent": "USD",
        "amount_received": 41000, "currency_received": "INR", "fee": 3,
    }
    base.update(kw)
    return base


def as_item(i, **kw):
    cleaned = clean(row(**kw))
    cleaned["sent_date"] = cleaned["sent_date"].isoformat()
    cleaned["id"] = i
    cleaned["effective_rate"] = round(cleaned["amount_received"] / cleaned["amount_sent"], 4)
    return cleaned


def test_clean_accepts_a_normal_remittance_and_normalizes():
    out = clean(row(currency_sent="usd", recipient="  Mom ", provider=" Wise "))
    assert out["currency_sent"] == "USD" and out["recipient"] == "Mom" and out["provider"] == "Wise"
    assert out["sent_date"] == date(2026, 3, 10) and out["fee"] == 3


@pytest.mark.parametrize("patch,message", [
    ({"amount_sent": 0}, "Amount sent"),
    ({"amount_sent": "abc"}, "Amount sent"),
    ({"amount_received": -5}, "Amount received"),
    ({"fee": -1}, "Fee"),
    ({"fee": 500}, "fee has to be less"),
    ({"recipient": "  "}, "Who did you send"),
    ({"currency_received": "XYZ"}, "Currency received"),
    ({"sent_date": "03/10/2026"}, "YYYY-MM-DD"),
    ({"sent_date": (date.today() + timedelta(days=2)).isoformat()}, "future"),
])
def test_clean_rejects_bad_input(patch, message):
    with pytest.raises(ValueError, match=message):
        clean(row(**patch))


def test_summary_groups_by_currency_pair_and_computes_weighted_rate():
    items = [
        as_item(1, amount_sent=500, amount_received=41000, fee=3, sent_date="2026-03-10"),
        as_item(2, amount_sent=300, amount_received=24300, fee=2, sent_date="2026-04-02", recipient="Dad"),
        as_item(3, amount_sent=100, amount_received=10000, currency_sent="GBP", sent_date="2026-04-05"),
    ]
    out = summarize(items, today=date(2026, 4, 20))
    usd = next(g for g in out if g["currency_sent"] == "USD")
    assert usd["count"] == 2 and usd["total_sent"] == 800 and usd["total_received"] == 65300
    assert usd["average_rate"] == round(65300 / 800, 4)
    assert usd["best_rate"] == 82 and usd["worst_rate"] == 81
    assert usd["total_fees"] == 5 and usd["fee_percent"] == round(5 / 800 * 100, 2)
    assert usd["latest_rate"] == 81
    assert usd["year_sent"] == 800
    months = {m["month"]: m["sent"] for m in usd["months"]}
    assert months["2026-03"] == 500 and months["2026-04"] == 300 and len(usd["months"]) == 12
    assert [r["recipient"] for r in usd["recipients"]] == ["Mom", "Dad"]
    assert {g["currency_sent"] for g in out} == {"USD", "GBP"}


def test_summary_year_total_ignores_last_year_and_old_months_fall_out():
    items = [as_item(1, sent_date="2025-01-10"), as_item(2, sent_date="2026-02-10")]
    usd = summarize(items, today=date(2026, 4, 20))[0]
    assert usd["year_sent"] == 500 and usd["total_sent"] == 1000
    assert "2025-01" not in {m["month"] for m in usd["months"]}


def test_summary_of_nothing_is_empty():
    assert summarize([], today=date(2026, 4, 20)) == []
