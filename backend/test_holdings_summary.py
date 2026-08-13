import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.holdings_service import to_summary, SUMMARY_FIELDS


def test_to_summary_keeps_only_summary_fields():
    full = {
        "id": 1,
        "asset_type": "stock",
        "symbol": "AAPL",
        "name": "Apple",
        "country": "United States",
        "account": "Brokerage",
        "currency": "USD",
        "display_value": 1000.0,
        "notes": "some private note",
        "tags": "tag1,tag2",
        "institution": "Fidelity",
        "interest_rate": None,
        "maturity_date": None,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00",
        "is_private": False,
        "status": "active",
    }
    summary = to_summary(full)
    assert set(summary.keys()) == set(SUMMARY_FIELDS)
    assert "notes" not in summary
    assert "institution" not in summary
    assert "created_at" not in summary
    assert summary["symbol"] == "AAPL"
    assert summary["display_value"] == 1000.0


def test_to_summary_handles_missing_keys_gracefully():
    summary = to_summary({"id": 1, "name": "Cash"})
    assert summary["id"] == 1
    assert summary["symbol"] is None


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
