"""
Unit tests for the CSV backup export's row-to-CSV formatting. The full
export_user_data_csv_zip flow (DB queries + zip assembly) is covered by a
live end-to-end check instead, since it needs an app/DB context.
"""
import csv
import io
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.account_service import _write_csv


def _parse(csv_text):
    return list(csv.DictReader(io.StringIO(csv_text)))


def test_write_csv_empty_list_is_empty_string():
    assert _write_csv([]) == ""


def test_write_csv_basic_rows():
    rows = [{"id": 1, "name": "AAPL"}, {"id": 2, "name": "BTC"}]
    parsed = _parse(_write_csv(rows))
    assert parsed == [{"id": "1", "name": "AAPL"}, {"id": "2", "name": "BTC"}]


def test_write_csv_uses_union_of_keys_across_heterogeneous_rows():
    # A stock holding and a cash holding don't share every field (e.g.
    # quantity vs no quantity) — the header must cover both without erroring.
    rows = [
        {"id": 1, "asset_type": "stock", "quantity": 10},
        {"id": 2, "asset_type": "cash"},
    ]
    text = _write_csv(rows)
    header = text.splitlines()[0]
    assert "quantity" in header
    parsed = _parse(text)
    assert parsed[1]["quantity"] == ""  # missing field renders as blank, not an error
