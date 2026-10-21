from datetime import date

from backend.history_backfill import (
    HoldingRecord,
    earliest_activity,
    month_starts,
    net_quantity_on,
    net_worth_on,
    reconstruct_series,
    valuation_on,
)


def _price(table):
    def fn(asset_type, symbol, on_date):
        return table.get((symbol, on_date))

    return fn


def _rate(table):
    def fn(frm, to, on_date):
        return table.get((frm, to))

    return fn


def test_net_quantity_counts_buys_and_sells_up_to_the_date():
    txs = [(date(2025, 1, 20), "buy", 100), (date(2025, 6, 1), "sell", 30), (date(2026, 1, 1), "buy", 5)]
    assert net_quantity_on(txs, date(2025, 1, 19)) == 0
    assert net_quantity_on(txs, date(2025, 3, 1)) == 100
    assert net_quantity_on(txs, date(2025, 7, 1)) == 70
    assert net_quantity_on(txs, date(2026, 2, 1)) == 75


def test_net_quantity_never_goes_negative():
    assert net_quantity_on([(date(2025, 1, 1), "sell", 10)], date(2025, 2, 1)) == 0


def test_valuation_uses_latest_on_or_before_the_date():
    vals = [(date(2025, 1, 1), 100, "USD"), (date(2025, 6, 1), 120, "USD")]
    assert valuation_on(vals, date(2024, 12, 31)) is None
    assert valuation_on(vals, date(2025, 3, 1)) == (100, "USD")
    assert valuation_on(vals, date(2025, 6, 1)) == (120, "USD")


def test_month_starts_skips_dates_before_first_activity_and_excludes_the_end():
    got = month_starts(date(2025, 1, 20), date(2025, 4, 10))
    assert got == [date(2025, 2, 1), date(2025, 3, 1), date(2025, 4, 1)]


def test_net_worth_sums_priced_stocks_and_valuation_assets_in_usd():
    stock = HoldingRecord("stock", "AMZN", "USD", transactions=[(date(2025, 1, 20), "buy", 100)])
    indian = HoldingRecord("stock", "RELIANCE.NS", "INR", transactions=[(date(2025, 1, 20), "buy", 10)])
    house = HoldingRecord("real_estate", None, "USD", valuations=[(date(2025, 1, 1), 800, "USD")])
    on = date(2025, 3, 1)
    total, missing = net_worth_on(
        [stock, indian, house],
        on,
        _price({("AMZN", on): (200.0, "USD"), ("RELIANCE.NS", on): (1000.0, "INR")}),
        _rate({("INR", "USD"): 0.01}),
    )
    assert missing == []
    assert total == 100 * 200 + 10 * 1000 * 0.01 + 800


def test_a_missing_price_skips_the_date_instead_of_recording_a_low_number():
    stock = HoldingRecord("stock", "AMZN", "USD", transactions=[(date(2025, 1, 20), "buy", 100)])
    total, missing = net_worth_on([stock], date(2025, 3, 1), _price({}), _rate({}))
    assert total is None
    assert missing == ["price for AMZN"]


def test_a_missing_fx_rate_skips_the_date():
    indian = HoldingRecord("stock", "RELIANCE.NS", "INR", transactions=[(date(2025, 1, 20), "buy", 10)])
    on = date(2025, 3, 1)
    total, missing = net_worth_on([indian], on, _price({("RELIANCE.NS", on): (1000.0, "INR")}), _rate({}))
    assert total is None
    assert any("INR->USD" in m for m in missing)


def test_reconstruct_series_reports_computed_and_skipped_dates_and_omits_empty_ones():
    stock = HoldingRecord("stock", "AMZN", "USD", transactions=[(date(2025, 2, 10), "buy", 10)])
    d_empty, d_ok, d_missing = date(2025, 2, 1), date(2025, 3, 1), date(2025, 4, 1)
    out = reconstruct_series([stock], [d_empty, d_ok, d_missing], _price({("AMZN", d_ok): (50.0, "USD")}), _rate({}))
    assert out == [
        {"date": d_ok, "total": 500.0, "by_asset_type": {"stock": 500.0}},
        {"date": d_missing, "skipped": ["price for AMZN"]},
    ]


def test_earliest_activity():
    h = HoldingRecord("stock", "X", "USD", transactions=[(date(2025, 5, 1), "buy", 1)], valuations=[(date(2024, 1, 1), 1, "USD")])
    assert earliest_activity([h]) == date(2024, 1, 1)
    assert earliest_activity([]) is None
