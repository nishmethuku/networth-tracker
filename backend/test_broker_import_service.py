from datetime import date

import pytest

from .broker_import_service import parse_broker_file, parse_number

ON = date(2026, 11, 17)


def parse(text, name="f.csv", **kw):
    return parse_broker_file(text.encode(), name, kw.pop("account", "Broker"), ON, **kw)


def test_parse_number_handles_money_formats():
    assert parse_number("$1,234.50") == 1234.5
    assert parse_number("1,23,456.78") == 123456.78
    assert parse_number("(12)") == -12
    assert parse_number("₹ 90") == 90
    assert parse_number("--") is None
    assert parse_number("") is None


def test_zerodha_console_sums_quantity_columns_and_strips_series():
    csv_text = (
        "Symbol,ISIN,Sector,Quantity Available,Quantity Discrepant,Quantity Long Term,"
        "Quantity Pledged (Margin),Quantity Pledged (Loan),Average Price,Previous Closing Price\n"
        "RELIANCE,INE002A01018,Energy,10,0,5,0,0,2400.5,2900\n"
        "ABC-BE,INE0000000,Other,3,0,0,0,0,50,60\n"
    )
    result = parse(csv_text)
    assert result["broker"] == "zerodha_console"
    rows = {r["symbol"]: r for r in result["rows"]}
    assert rows["RELIANCE"]["quantity"] == 15
    assert rows["RELIANCE"]["price_per_unit"] == 2400.5
    assert rows["RELIANCE"]["currency"] == "INR" and rows["RELIANCE"]["country"] == "India"
    assert "ABC" in rows
    assert rows["RELIANCE"]["transaction_type"] == "buy" and rows["RELIANCE"]["date"] == "2026-11-17"
    assert any("Compare a few rows" in w for w in result["warnings"])


def test_zerodha_kite_download():
    csv_text = "Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L\nINFY,4,1500.25,1600,6400,400\n"
    result = parse(csv_text)
    assert result["broker"] == "zerodha_kite"
    assert result["rows"][0]["symbol"] == "INFY" and result["rows"][0]["quantity"] == 4


def test_groww_has_names_not_tickers():
    csv_text = (
        "Name,Client ID\nx,y\n\n"
        "Stock Name,ISIN,Quantity,Average buy price,Buy value,Closing price,Closing value\n"
        "Reliance Industries Ltd,INE002A01018,2,2500,5000,2900,5800\n"
    )
    result = parse(csv_text)
    assert result["broker"] == "groww"
    row = result["rows"][0]
    assert row["symbol"] == "" and row["name"] == "Reliance Industries Ltd"
    assert row["currency"] == "INR"
    assert any("Fill in the Symbol" in w for w in result["warnings"])


def test_fidelity_skips_cash_options_and_footer():
    csv_text = (
        "\n"
        "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,"
        "Cost Basis Total,Average Cost Basis,Type\n"
        'X1,Individual,AAPL,APPLE INC,10,$200.00,$1,"$2,000.00","$1,500.00",$150.00,Cash\n'
        "X1,Individual,SPAXX**,MONEY MARKET,500,$1.00,,$500.00,,,Cash\n"
        "X1,Individual, -AAPL261218C300,CALL,1,$5,,$500,$300,$300,Cash\n"
        "X1,Individual,VTI,VANGUARD TOTAL,2,$300,,$600,$500,--,Cash\n"
        "\n"
        '"The data and information in this spreadsheet is provided to you solely for your use"\n'
    )
    result = parse(csv_text, account="Fidelity")
    assert result["broker"] == "fidelity"
    rows = {r["symbol"]: r for r in result["rows"]}
    assert set(rows) == {"AAPL", "VTI"}
    assert rows["AAPL"]["price_per_unit"] == 150
    assert rows["VTI"]["price_per_unit"] == 250  # cost basis total / quantity when average is missing
    assert rows["AAPL"]["currency"] == "USD" and rows["AAPL"]["account"] == "Fidelity"
    assert any("money market" in w for w in result["warnings"])
    assert any("options" in w for w in result["warnings"])


def test_ibkr_activity_statement_open_positions():
    csv_text = (
        "Statement,Header,Field Name,Field Value\n"
        "Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value\n"
        "Open Positions,Data,Summary,Stocks,USD,MSFT,5,1,300,1500,400,2000\n"
        "Open Positions,Data,Summary,Stocks,AUD,BHP,10,1,40,400,45,450\n"
        "Open Positions,Data,Summary,Equity and Index Options,USD,SPY 21DEC,1,100,5,500,6,600\n"
        "Open Positions,Total,,Stocks,USD,,,,,1500,,2000\n"
    )
    result = parse(csv_text, account="IBKR")
    assert result["broker"] == "ibkr_activity"
    rows = {r["symbol"]: r for r in result["rows"]}
    assert set(rows) == {"MSFT", "BHP"}
    assert rows["BHP"]["currency"] == "AUD" and rows["BHP"]["country"] == "Australia"
    assert rows["MSFT"]["country"] == "United States"


def test_generic_table_uses_defaults():
    csv_text = "Ticker,Shares,Average Cost\nVOO,3,400\n"
    result = parse(csv_text, default_currency="AUD", default_country="Australia")
    assert result["broker"] == "generic"
    assert result["rows"][0]["currency"] == "AUD" and result["rows"][0]["country"] == "Australia"


def test_existing_holdings_are_flagged_not_dropped():
    csv_text = "Instrument,Qty.,Avg. cost\nINFY,4,1500\nTCS,1,3000\n"
    result = parse(csv_text, account="Zerodha", existing={("zerodha", "INFY")})
    flags = {r["symbol"]: r["already_in_account"] for r in result["rows"]}
    assert flags == {"INFY": True, "TCS": False}
    assert any("already in the 'Zerodha' account" in w for w in result["warnings"])


def test_rejects_non_holdings_files_and_missing_account():
    with pytest.raises(ValueError, match="does not look like a holdings file"):
        parse("a,b\n1,2\n")
    with pytest.raises(ValueError, match="account name"):
        parse_broker_file(b"Ticker,Shares,Average Cost\nA,1,1\n", "f.csv", " ", ON)
    with pytest.raises(ValueError, match="Only .csv and .xlsx"):
        parse_broker_file(b"x", "f.pdf", "A", ON)


def test_rows_feed_the_existing_confirm_validation():
    from .smart_import_service import _validate_row

    result = parse("Ticker,Shares,Average Cost\nVOO,3,400\n")
    normalized = _validate_row(result["rows"][0])
    assert normalized["quantity"] == 3 and normalized["price_per_unit"] == 400 and normalized["transaction_type"] == "buy"
