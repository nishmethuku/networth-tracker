"""
Tests for the deterministic (no AI) CSV importer -- the "one agreed
format, no broker picker" replacement for the AI spreadsheet importer and
the broker-specific importer.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.simple_csv_import_service import parse_simple_csv

HEADER = "Holding Type,Holding Account,Source,Investment,Transaction,Transaction Date,Transaction Units,Transaction price,Currency,Country\n"


def test_parses_the_agreed_format_with_zero_errors():
    csv_text = HEADER + (
        "Stocks,Amma,Amma-Bank1,AJANTPHARM,Buy,7/8/2020,45,948.89,INR,India\n"
        "Stocks,Amma,Amma-Bank1,AJANTPHARM,Sell,6/10/2024,45,2480,INR,India\n"
    )
    result = parse_simple_csv(csv_text)
    assert result["errors"] == []
    assert len(result["rows"]) == 2
    buy, sell = result["rows"]
    assert buy["asset_type"] == "stock"
    assert buy["symbol"] == "AJANTPHARM"
    assert buy["source_account"] == "Amma-Bank1"
    assert buy["transaction_type"] == "buy"
    assert sell["transaction_type"] == "sell"


def test_dates_parse_day_first_for_ambiguous_dd_mm_dates():
    # 7/8/2020 must mean 7 Aug (day-first), not Jul 8 -- the whole point of
    # this parser existing for an Indian-context user rather than reusing
    # the broker parsers' US-first date order.
    csv_text = HEADER + "Stocks,Amma,,AJANTPHARM,Buy,7/8/2020,45,948.89,INR,India\n"
    result = parse_simple_csv(csv_text)
    assert result["rows"][0]["date"] == "2020-08-07"


def test_unambiguous_date_still_parses_correctly():
    # Day 13 can't be a month, so this is unambiguous either way.
    csv_text = HEADER + "Stocks,Amma,,AJANTPHARM,Buy,13/8/2020,45,948.89,INR,India\n"
    result = parse_simple_csv(csv_text)
    assert result["rows"][0]["date"] == "2020-08-13"


def test_holding_type_aliases_map_to_valid_asset_types():
    csv_text = HEADER + (
        "Precious Metals,ABC,,Gold,Buy,1/1/2024,2,100000,INR,India\n"
        "Real Estate,XYZ,,Sobha1,Buy,1/1/2024,1,100000000,INR,India\n"
        "Mutual Fund,Daddy,,Some Fund,Buy,1/1/2024,10,50,INR,India\n"
    )
    result = parse_simple_csv(csv_text)
    assert result["errors"] == []
    types = [r["asset_type"] for r in result["rows"]]
    assert types == ["commodity", "real_estate", "mutual_fund"]


def test_blank_holding_type_defaults_to_stock():
    csv_text = HEADER + ",Amma,,AAPL,Buy,1/1/2024,10,150,USD,United States\n"
    result = parse_simple_csv(csv_text)
    assert result["errors"] == []
    assert result["rows"][0]["asset_type"] == "stock"


def test_unrecognized_holding_type_is_an_error_not_a_silent_default():
    csv_text = HEADER + "Cryptocurrency Futures Derivative,Amma,,XYZ,Buy,1/1/2024,10,150,USD,United States\n"
    result = parse_simple_csv(csv_text)
    assert result["rows"] == []
    assert "unrecognized holding type" in result["errors"][0]


def test_missing_required_columns_gives_a_clear_error():
    result = parse_simple_csv("foo,bar\n1,2\n")
    assert result["rows"] == []
    assert "Couldn't find expected column" in result["errors"][0]


def test_non_positive_quantity_or_price_is_skipped_with_an_error():
    csv_text = HEADER + (
        "Stocks,Amma,,AAPL,Buy,1/1/2024,0,150,USD,United States\n"
        "Stocks,Amma,,AAPL,Buy,1/1/2024,10,0,USD,United States\n"
    )
    result = parse_simple_csv(csv_text)
    assert result["rows"] == []
    assert len(result["errors"]) == 2


def test_unparseable_number_is_an_error_not_zero():
    # Same bug class as the broker CSV parsers -- "N/A" must not silently
    # become a $0 price that then passes a `> 0` check.
    csv_text = HEADER + "Stocks,Amma,,AAPL,Buy,1/1/2024,10,N/A,USD,United States\n"
    result = parse_simple_csv(csv_text)
    assert result["rows"] == []
    assert len(result["errors"]) == 1


def test_invalid_currency_and_country_default_rather_than_error():
    csv_text = HEADER + "Stocks,Amma,,AAPL,Buy,1/1/2024,10,150,GBP,United Kingdom\n"
    result = parse_simple_csv(csv_text)
    assert result["errors"] == []
    assert result["rows"][0]["currency"] == "USD"
    assert result["rows"][0]["country"] == "United States"


def test_value_is_quantity_times_price():
    csv_text = HEADER + "Stocks,Amma,,AAPL,Buy,1/1/2024,10,150.5,USD,United States\n"
    result = parse_simple_csv(csv_text)
    assert result["rows"][0]["value"] == 1505.0


def test_column_aliases_are_accepted():
    # A file using "Account"/"Stock"/"Units"/"Price" instead of the
    # canonical header names should still parse.
    alt_header = "Type,Account,Source,Stock,Transaction Type,Date,Qty,Price,Currency,Country\n"
    csv_text = alt_header + "Stock,Amma,,AAPL,Buy,1/1/2024,10,150,USD,United States\n"
    result = parse_simple_csv(csv_text)
    assert result["errors"] == []
    assert result["rows"][0]["symbol"] == "AAPL"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
