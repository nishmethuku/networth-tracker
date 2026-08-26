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
