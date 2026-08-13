"""
CSV parser tests using hand-built sample files matching each broker's
documented export format. These are NOT verified against real exports —
see the plan's risk note. They confirm the parsing logic is internally
correct; your first real file per broker is the actual acceptance test.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.csv_import_service import parse_zerodha, parse_groww, parse_fidelity, parse_robinhood


def test_zerodha_parses_buy_and_sell():
    csv_text = (
        "symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time\n"
        "RELIANCE,INE002A01018,2024-01-15,NSE,EQ,EQ,buy,false,10,2500.50,1,1,09:15:00\n"
        "RELIANCE,INE002A01018,2024-06-01,NSE,EQ,EQ,sell,false,5,2700.00,2,2,09:15:00\n"
    )
    result = parse_zerodha(csv_text)
    assert result["errors"] == []
    assert len(result["rows"]) == 2
    buy, sell = result["rows"]
    assert buy["symbol"] == "RELIANCE.NS"
    assert buy["transaction_type"] == "buy"
    assert buy["quantity"] == 10
    assert buy["price_per_unit"] == 2500.50
    assert sell["transaction_type"] == "sell"


def test_zerodha_missing_columns_gives_clear_error():
    result = parse_zerodha("foo,bar\n1,2\n")
    assert result["rows"] == []
    assert "Couldn't find expected column" in result["errors"][0]


def test_groww_detects_stock_format():
    csv_text = (
        "Stock Name,ISIN,Trade Date,Exchange,Segment,Series,Trade Type,Quantity,Price,Trade ID,Order ID,Time\n"
        "TCS,INE467B01029,2024-02-01,NSE,EQ,EQ,buy,3,3800.00,1,1,10:00:00\n"
    )
    result = parse_groww(csv_text)
    assert result["errors"] == []
    assert result["rows"][0]["asset_type"] == "stock"
    assert result["rows"][0]["symbol"] == "TCS.NS"


def test_groww_detects_mutual_fund_format():
    csv_text = (
        "Scheme Name,Folio No,Transaction Type,Transaction Date,Amount (INR),NAV,Units\n"
        "Axis Bluechip Fund,12345,Purchase,2024-03-01,10000,45.5,219.78\n"
    )
    result = parse_groww(csv_text)
    assert result["errors"] == []
    assert result["rows"][0]["asset_type"] == "mutual_fund"
    assert result["rows"][0]["transaction_type"] == "buy"
    assert result["rows"][0]["quantity"] == 219.78


def test_fidelity_parses_bought_and_sold_actions():
    csv_text = (
        "Run Date,Account,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date\n"
        "01/15/2024,X123,YOU BOUGHT COMMON STOCK,AAPL,APPLE INC,Cash,10,150.00,0,0,-1500.00,01/17/2024\n"
        "06/01/2024,X123,YOU SOLD COMMON STOCK,AAPL,APPLE INC,Cash,5,180.00,4.95,0,895.05,06/03/2024\n"
    )
    result = parse_fidelity(csv_text)
    assert result["errors"] == []
    assert len(result["rows"]) == 2
    buy, sell = result["rows"]
    assert buy["transaction_type"] == "buy"
    assert buy["quantity"] == 10
    assert sell["transaction_type"] == "sell"
    assert sell["fees"] == 4.95


def test_fidelity_skips_unsupported_actions():
    csv_text = (
        "Run Date,Account,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date\n"
        "01/15/2024,X123,DIVIDEND RECEIVED,AAPL,APPLE INC,Cash,0,0,0,0,12.50,01/17/2024\n"
    )
    result = parse_fidelity(csv_text)
    assert result["rows"][0]["skipped"] is True


def test_robinhood_parses_buy_and_sell():
    csv_text = (
        "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n"
        "01/15/2024,01/16/2024,01/17/2024,TSLA,TESLA INC,Buy,4,200.00,($800.00)\n"
        "06/01/2024,06/02/2024,06/03/2024,TSLA,TESLA INC,Sell,2,250.00,$500.00\n"
    )
    result = parse_robinhood(csv_text)
    assert result["errors"] == []
    assert len(result["rows"]) == 2
    assert result["rows"][0]["transaction_type"] == "buy"
    assert result["rows"][0]["price_per_unit"] == 200.00
    assert result["rows"][1]["transaction_type"] == "sell"


def test_robinhood_skips_non_trade_codes():
    csv_text = (
        "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n"
        "01/15/2024,01/16/2024,01/17/2024,TSLA,TESLA INC,CDIV,,,$5.00\n"
    )
    result = parse_robinhood(csv_text)
    assert result["rows"][0]["skipped"] is True


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
