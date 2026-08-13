"""
ai_service tests. No real Anthropic API calls — the client is mocked so
these run in CI without an ANTHROPIC_API_KEY.
"""
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import ai_service


def _fake_text_response(text):
    block = MagicMock()
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


def test_is_configured_false_without_key():
    with patch.object(ai_service, "ANTHROPIC_API_KEY", None):
        assert ai_service.is_configured() is False


def test_is_configured_true_with_key():
    with patch.object(ai_service, "ANTHROPIC_API_KEY", "sk-fake"):
        assert ai_service.is_configured() is True


def test_get_client_returns_none_without_key():
    with patch.object(ai_service, "ANTHROPIC_API_KEY", None):
        assert ai_service.get_client() is None


def test_build_portfolio_snapshot_summarizes_quantity_and_valuation_holdings():
    holdings_with_metrics = [
        {
            "name": "Apple",
            "asset_type": "stock",
            "symbol": "AAPL",
            "country": "United States",
            "currency": "USD",
            "display_value": 1000.567,
            "unrealized_gain": 100.111,
            "realized_gain": 0.0,
            "xirr": 0.152,
        },
        {
            "name": "Home",
            "asset_type": "real_estate",
            "symbol": None,
            "country": "India",
            "currency": "INR",
            "display_value": 5000.0,
        },
    ]
    dashboard = {
        "total_net_worth": 6000.0,
        "allocation_by_type": [{"label": "stock", "value": 1000.0}],
        "allocation_by_country": [{"label": "United States", "value": 1000.0}],
        "realized_gain": 0.0,
        "unrealized_gain": 100.11,
        "top_gainers": [],
        "top_losers": [],
    }

    snapshot = ai_service.build_portfolio_snapshot(holdings_with_metrics, dashboard, "USD")

    assert snapshot["display_currency"] == "USD"
    assert snapshot["total_net_worth"] == 6000.0
    assert len(snapshot["holdings"]) == 2
    stock_entry = snapshot["holdings"][0]
    assert stock_entry["xirr_pct"] == 15.2
    assert stock_entry["unrealized_gain"] == 100.11
    real_estate_entry = snapshot["holdings"][1]
    assert "unrealized_gain" not in real_estate_entry


def test_suggest_transaction_tags_parses_json_response():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _fake_text_response(
            '{"tags": ["Core-Holding", "Dip-Buy"], "note": "Bought the dip."}'
        )
        mock_get_client.return_value = mock_client

        result = ai_service.suggest_transaction_tags("Apple", "stock", "buy", 10, 150.0, "USD")

    assert result == {"tags": ["core-holding", "dip-buy"], "note": "Bought the dip."}


def test_suggest_transaction_tags_returns_none_on_malformed_json():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _fake_text_response("not json at all")
        mock_get_client.return_value = mock_client

        result = ai_service.suggest_transaction_tags("Apple", "stock", "buy", 10, 150.0, "USD")

    assert result is None


def test_suggest_transaction_tags_returns_none_without_client():
    with patch.object(ai_service, "get_client", return_value=None):
        result = ai_service.suggest_transaction_tags("Apple", "stock", "buy", 10, 150.0, "USD")
    assert result is None


def test_parse_search_query_strips_code_fences():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = _fake_text_response(
            '```json\n{"asset_types": ["crypto"], "countries": [], "min_value": null, '
            '"max_value": null, "min_gain_pct": null, "max_gain_pct": null, '
            '"gainers_only": true, "losers_only": false, "text": null}\n```'
        )
        mock_get_client.return_value = mock_client

        result = ai_service.parse_search_query("show me my crypto that's up")

    assert result["asset_types"] == ["crypto"]
    assert result["gainers_only"] is True


def test_generate_digest_narrative_returns_none_without_client():
    with patch.object(ai_service, "get_client", return_value=None):
        result = ai_service.generate_digest_narrative({"total_net_worth": 100}, "Nish")
    assert result is None


def test_chat_stream_raises_when_not_configured():
    with patch.object(ai_service, "get_client", return_value=None):
        try:
            list(ai_service.chat_stream([{"role": "user", "content": "hi"}], {}))
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
