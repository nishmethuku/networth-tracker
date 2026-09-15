import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from backend.smart_import_service import _validate_row, extract_sheet_text


def test_validate_row_quantity_based_with_full_data():
    row = {"asset_type": "stock", "name": "Apple Inc", "symbol": "AAPL", "quantity": 50, "price_per_unit": 195.2, "value": 9760.0, "currency": "USD", "country": "United States", "date": "2026-01-01"}
    normalized = _validate_row(row)
    assert normalized["quantity"] == 50
    assert normalized["price_per_unit"] == 195.2
    assert normalized["date"] == date(2026, 1, 1)


def test_validate_row_quantity_based_derives_price_from_value_when_missing():
    row = {"asset_type": "stock", "name": "Apple Inc", "symbol": "AAPL", "quantity": 10, "value": 2000.0}
    normalized = _validate_row(row)
    assert normalized["price_per_unit"] == 200.0


def test_validate_row_quantity_based_defaults_to_single_unit_when_no_quantity():
    row = {"asset_type": "stock", "name": "Some Fund", "value": 5000.0}
    normalized = _validate_row(row)
    assert normalized["quantity"] == 1.0
    assert normalized["price_per_unit"] == 5000.0


def test_validate_row_valuation_based_type():
    row = {"asset_type": "real_estate", "name": "My House", "value": 500000.0}
    normalized = _validate_row(row)
    assert normalized["value"] == 500000.0
    assert "quantity" not in normalized


def test_validate_row_rejects_unknown_asset_type():
    with pytest.raises(ValueError):
        _validate_row({"asset_type": "bitcoin_mining_rig", "value": 100})


def test_validate_row_rejects_zero_quantity():
    with pytest.raises(ValueError):
        _validate_row({"asset_type": "stock", "quantity": 0, "value": 100})


def test_validate_row_defaults_missing_date_to_today():
    row = {"asset_type": "cash", "name": "Checking", "value": 1000.0}
    normalized = _validate_row(row)
    assert normalized["date"] == date.today()


def test_validate_row_transaction_type_requires_quantity_and_price():
    row = {"asset_type": "stock", "symbol": "AAPL", "transaction_type": "buy", "date": "2026-08-01"}
    with pytest.raises(ValueError):
        _validate_row(row)


def test_validate_row_transaction_type_buy_with_full_data():
    row = {
        "asset_type": "stock", "symbol": "AAPL", "account": "Morgan Stanley",
        "transaction_type": "buy", "quantity": 10, "price_per_unit": 190.5,
        "source_account": "Vijay Chase", "date": "2026-08-01",
    }
    normalized = _validate_row(row)
    assert normalized["transaction_type"] == "buy"
    assert normalized["source_account"] == "Vijay Chase"
    assert normalized["quantity"] == 10
    assert normalized["price_per_unit"] == 190.5


def test_validate_row_rejects_unknown_transaction_type():
    row = {"asset_type": "stock", "symbol": "AAPL", "transaction_type": "transfer", "quantity": 1, "price_per_unit": 1}
    with pytest.raises(ValueError):
        _validate_row(row)


def test_validate_row_blank_source_account_normalizes_to_none():
    row = {"asset_type": "stock", "symbol": "AAPL", "transaction_type": "sell", "quantity": 1, "price_per_unit": 1, "source_account": "  "}
    normalized = _validate_row(row)
    assert normalized["source_account"] is None


def test_validate_row_non_quantity_type_transaction_row_has_no_quantity_or_price():
    # Regression: confirm_smart_import branches on whether "quantity"/
    # "price_per_unit" are present to decide HoldingTransaction (quantity-
    # based types) vs. HoldingValuation (real_estate/cash/etc.) -- a
    # transaction-log row for a non-quantity type must not carry those keys,
    # or confirm_smart_import would KeyError trying to build a transaction
    # for a type that doesn't have one.
    row = {"asset_type": "real_estate", "name": "Sobha1", "account": "XYZ", "transaction_type": "buy", "quantity": 1, "price_per_unit": 100000000, "value": 100000000}
    normalized = _validate_row(row)
    assert "quantity" not in normalized
    assert "price_per_unit" not in normalized
    assert normalized["value"] == 100000000


def test_validate_row_snapshot_row_has_no_transaction_type_by_default():
    row = {"asset_type": "stock", "symbol": "AAPL", "quantity": 10, "value": 2000.0}
    normalized = _validate_row(row)
    assert normalized["transaction_type"] is None


def _row(symbol, transaction_type, quantity, price_per_unit, date_str, source_account, account="Zerodha", currency="USD"):
    return {
        "asset_type": "stock", "symbol": symbol, "name": symbol,
        "quantity": quantity, "price_per_unit": price_per_unit,
        "value": round(quantity * price_per_unit, 2),
        "currency": currency, "country": "United States",
        "date": date_str, "transaction_type": transaction_type,
        "account": account, "source_account": source_account,
    }


def test_confirm_smart_import_queries_each_funding_accounts_valuations_at_most_once():
    """Regression: HoldingValuation.query...all() previously ran once per
    *row* referencing a funding/deposit account, not once per account --
    a 168-row real-world import (most rows sharing a couple of funding
    accounts) measured at 17s against the real DB, over the frontend's
    15s default timeout, before this fix (7s after). Three buys here all
    fund from the same brand-new "Bank1" account; the valuation history
    query must never run at all for it (the seed valuation is cached
    directly in memory when the account is created), and the resulting
    balance must still be the correct running total."""
    from unittest.mock import MagicMock, patch

    from backend.models import Holding as RealHolding
    from backend.models import HoldingValuation as RealHoldingValuation
    from backend.smart_import_service import confirm_smart_import

    rows = [
        _row("AAA", "buy", 10, 100.0, "2024-01-01", "Bank1"),
        _row("BBB", "buy", 5, 50.0, "2024-01-02", "Bank1"),
        _row("CCC", "buy", 2, 25.0, "2024-01-03", "Bank1"),
    ]

    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.filter.return_value.first.return_value = None  # main holdings: always new
    mock_holding_query.filter.return_value.first.return_value = None  # cash holding: doesn't exist yet
    mock_valuation_query = MagicMock()

    # side_effect=RealHolding/RealHoldingValuation: constructor calls still
    # build real model instances (so attributes like .currency and the
    # computed .value are real, not auto-generated Mock attributes) --
    # only .query is a separate, controlled mock. Patched by module-level
    # name (smart_import_service's own reference), not the class's .query
    # attribute directly, since that's a Flask-SQLAlchemy descriptor that
    # needs a live app context just to read its current value.
    mock_holding_class = MagicMock(side_effect=RealHolding)
    mock_holding_class.query = mock_holding_query
    mock_valuation_class = MagicMock(side_effect=RealHoldingValuation)
    mock_valuation_class.query = mock_valuation_query

    with patch("backend.smart_import_service.Holding", mock_holding_class), \
         patch("backend.smart_import_service.HoldingValuation", mock_valuation_class), \
         patch("backend.smart_import_service.db") as mock_db:
        result = confirm_smart_import(rows, user_id="u1")

    assert result["errors"] == []
    assert result["transactions_added"] == 3
    # The whole point of the fix: this must never be called for a
    # brand-new account (its history starts as just the in-memory seed).
    mock_valuation_query.filter_by.assert_not_called()

    # Each buy deducts from Bank1's running balance, chained entirely
    # in-memory: 0 -> -1000 -> -1250 -> -1300.
    added_valuations = [
        call.args[0] for call in mock_db.session.add.call_args_list if isinstance(call.args[0], RealHoldingValuation)
    ]
    balances = [v.value for v in added_valuations]
    assert balances == [0.0, -1000.0, -1250.0, -1300.0]


def test_confirm_smart_import_reuses_existing_funding_account_valuations_query_once():
    """Same regression, for a funding account that already has history in
    the DB (not newly created this batch) -- the query must run exactly
    once for it, not once per row."""
    from datetime import date
    from unittest.mock import MagicMock, patch

    from backend.models import Holding as RealHolding
    from backend.models import HoldingValuation as RealHoldingValuation
    from backend.smart_import_service import confirm_smart_import

    rows = [
        _row("AAA", "buy", 10, 100.0, "2024-01-01", "Bank1"),
        _row("BBB", "buy", 5, 50.0, "2024-01-02", "Bank1"),
    ]

    existing_cash_holding = MagicMock(id=42, asset_type="cash", currency="USD")
    existing_valuation = RealHoldingValuation(holding_id=42, user_id="u1", valuation_date=date(2023, 12, 1), value=5000.0, currency="USD")

    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.filter.return_value.first.return_value = None  # main holdings: always new
    mock_holding_query.filter.return_value.first.return_value = existing_cash_holding  # cash: already exists
    mock_valuation_query = MagicMock()
    mock_valuation_query.filter_by.return_value.all.return_value = [existing_valuation]

    mock_holding_class = MagicMock(side_effect=RealHolding)
    mock_holding_class.query = mock_holding_query
    mock_valuation_class = MagicMock(side_effect=RealHoldingValuation)
    mock_valuation_class.query = mock_valuation_query

    with patch("backend.smart_import_service.Holding", mock_holding_class), \
         patch("backend.smart_import_service.HoldingValuation", mock_valuation_class), \
         patch("backend.smart_import_service.db"):
        result = confirm_smart_import(rows, user_id="u1")

    assert result["errors"] == []
    mock_valuation_query.filter_by.assert_called_once_with(holding_id=42)


def test_extract_sheet_text_reads_csv():
    csv_bytes = b"Name,Value\nApple,1000\nHouse,500000\n"
    text = extract_sheet_text(csv_bytes, "portfolio.csv")
    assert "Apple" in text
    assert "500000" in text


def test_extract_sheet_text_drops_blank_rows_and_columns():
    csv_bytes = b"Name,Value,Unused\nApple,1000,\n,,\n"
    text = extract_sheet_text(csv_bytes, "portfolio.csv")
    assert "Unused" not in text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
