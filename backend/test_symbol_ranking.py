import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services import rank_symbol_results


def test_exact_symbol_match_ranks_first():
    results = [
        {"symbol": "MLP", "displaySymbol": "MLP", "description": "Maui Land & Pineapple Company Inc"},
        {"symbol": "AAPL", "displaySymbol": "AAPL", "description": "Apple Inc"},
        {"symbol": "APLE", "displaySymbol": "APLE", "description": "Apple Hospitality REIT Inc"},
    ]
    ranked = rank_symbol_results(results, "AAPL")
    assert ranked[0]["symbol"] == "AAPL"


def test_name_prefix_match_ranks_above_substring_match():
    results = [
        {"symbol": "PAPL", "displaySymbol": "PAPL", "description": "Pineapple Financial Inc"},
        {"symbol": "AAPL", "displaySymbol": "AAPL", "description": "Apple Inc"},
    ]
    ranked = rank_symbol_results(results, "Apple")
    assert ranked[0]["symbol"] == "AAPL"
    assert ranked[1]["symbol"] == "PAPL"


def test_preserves_relative_order_within_a_tier():
    results = [
        {"symbol": "AAPL", "displaySymbol": "AAPL", "description": "Apple Inc"},
        {"symbol": "AAPL.MX", "displaySymbol": "AAPL.MX", "description": "Apple Inc"},
        {"symbol": "AAPL.SW", "displaySymbol": "AAPL.SW", "description": "Apple Inc"},
    ]
    ranked = rank_symbol_results(results, "Apple")
    assert [r["symbol"] for r in ranked] == ["AAPL", "AAPL.MX", "AAPL.SW"]


def test_empty_query_returns_results_unchanged():
    results = [{"symbol": "B", "displaySymbol": "B", "description": "Beta"}, {"symbol": "A", "displaySymbol": "A", "description": "Alpha"}]
    assert rank_symbol_results(results, "") == results


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
