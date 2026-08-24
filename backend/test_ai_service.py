"""
ai_service tests. No real Gemini API calls — the client is mocked so
these run in CI without a GEMINI_API_KEY.
"""
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.genai import errors as genai_errors

from backend import ai_service


def _fake_text_response(text):
    response = MagicMock()
    response.text = text
    return response


def _server_error(code):
    return genai_errors.ServerError(code, {"error": {"code": code, "status": "UNAVAILABLE"}})


def _client_error(code):
    return genai_errors.ClientError(code, {"error": {"code": code, "status": "INVALID_ARGUMENT"}})


def test_is_configured_false_without_key():
    with patch.object(ai_service, "GEMINI_API_KEY", None):
        assert ai_service.is_configured() is False


def test_is_configured_true_with_key():
    with patch.object(ai_service, "GEMINI_API_KEY", "fake-key"):
        assert ai_service.is_configured() is True


def test_get_client_returns_none_without_key():
    with patch.object(ai_service, "GEMINI_API_KEY", None):
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
        mock_client.models.generate_content.return_value = _fake_text_response(
            '{"tags": ["Core-Holding", "Dip-Buy"], "note": "Bought the dip."}'
        )
        mock_get_client.return_value = mock_client

        result = ai_service.suggest_transaction_tags("Apple", "stock", "buy", 10, 150.0, "USD")

    assert result == {"tags": ["core-holding", "dip-buy"], "note": "Bought the dip."}


def test_suggest_transaction_tags_returns_none_on_malformed_json():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _fake_text_response("not json at all")
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
        mock_client.models.generate_content.return_value = _fake_text_response(
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


def test_generate_budget_narrative_returns_none_without_client():
    with patch.object(ai_service, "get_client", return_value=None):
        result = ai_service.generate_budget_narrative({"months": [], "category_breakdown": []})
    assert result is None


def test_generate_budget_narrative_returns_text_when_configured():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _fake_text_response("You spent the most on housing this month.")
        mock_get_client.return_value = mock_client

        result = ai_service.generate_budget_narrative({"months": [{"month": "2026-03", "expenses": 2000}], "category_breakdown": []})

    assert result == "You spent the most on housing this month."


def test_generate_text_retries_once_on_retryable_server_error_then_succeeds():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = [
            _server_error(503),
            _fake_text_response("hello"),
        ]
        mock_get_client.return_value = mock_client

        result = ai_service.generate_text("hi")

    assert result == "hello"
    assert mock_client.models.generate_content.call_count == 2


def test_generate_text_returns_none_after_second_retryable_failure():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = [_server_error(503), _server_error(500)]
        mock_get_client.return_value = mock_client

        result = ai_service.generate_text("hi")

    assert result is None
    assert mock_client.models.generate_content.call_count == 2


def test_generate_text_does_not_retry_non_retryable_error():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = _client_error(400)
        mock_get_client.return_value = mock_client

        result = ai_service.generate_text("hi")

    assert result is None
    assert mock_client.models.generate_content.call_count == 1


def test_generate_text_raises_quota_exceeded_on_429():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = _client_error(429)
        mock_get_client.return_value = mock_client

        try:
            ai_service.generate_text("hi")
            assert False, "expected QuotaExceededError"
        except ai_service.QuotaExceededError as e:
            assert "daily" in str(e).lower()
    assert mock_client.models.generate_content.call_count == 1


def test_suggest_transaction_tags_swallows_quota_exceeded():
    """Ambient, best-effort feature — never surfaces a quota error, unlike
    the interactive AI features."""
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = _client_error(429)
        mock_get_client.return_value = mock_client

        result = ai_service.suggest_transaction_tags("AAPL", "stock", "buy", 1, 100, "USD")

    assert result is None


def test_generate_digest_narrative_swallows_quota_exceeded():
    """Background email job — no one to show an error to, so it always
    falls back to the structured-only email."""
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = _client_error(429)
        mock_get_client.return_value = mock_client

        result = ai_service.generate_digest_narrative({"net_worth": 1000})

    assert result is None


def test_generate_budget_narrative_raises_quota_exceeded():
    """Interactive "Get AI Insights" button — the route catches this to
    show a specific message instead of a generic failure."""
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = _client_error(429)
        mock_get_client.return_value = mock_client

        try:
            ai_service.generate_budget_narrative({"months": []})
            assert False, "expected QuotaExceededError"
        except ai_service.QuotaExceededError:
            pass


def test_chat_stream_retries_once_when_no_chunks_yielded_yet():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        chunk = MagicMock()
        chunk.text = "hi there"

        def _raise_503():
            raise _server_error(503)
            yield  # pragma: no cover - makes this a generator

        mock_client.models.generate_content_stream.side_effect = [_raise_503(), [chunk]]
        mock_get_client.return_value = mock_client

        chunks = list(ai_service.chat_stream([{"role": "user", "content": "hi"}], {}))

    assert chunks == ["hi there"]
    assert mock_client.models.generate_content_stream.call_count == 2


def test_chat_stream_does_not_retry_once_chunks_already_yielded():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        chunk = MagicMock()
        chunk.text = "partial"

        def _yield_then_raise():
            yield chunk
            raise _server_error(503)

        mock_client.models.generate_content_stream.return_value = _yield_then_raise()
        mock_get_client.return_value = mock_client

        collected = []
        try:
            for c in ai_service.chat_stream([{"role": "user", "content": "hi"}], {}):
                collected.append(c)
            assert False, "expected RuntimeError to propagate"
        except RuntimeError:
            pass

    assert collected == ["partial"]
    assert mock_client.models.generate_content_stream.call_count == 1


def test_chat_stream_wraps_api_errors_in_a_friendly_runtime_error():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        mock_client.models.generate_content_stream.side_effect = _server_error(500)
        mock_get_client.return_value = mock_client

        try:
            list(ai_service.chat_stream([{"role": "user", "content": "hi"}], {}))
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "quota" not in str(e).lower()
            assert "500" not in str(e)
            assert isinstance(e.__cause__, genai_errors.ServerError)


def test_chat_stream_reports_quota_errors_distinctly():
    with patch.object(ai_service, "get_client") as mock_get_client, patch.object(ai_service.time, "sleep"):
        mock_client = MagicMock()
        quota_error = genai_errors.ClientError(
            429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quotaMetric: ..."}}
        )
        mock_client.models.generate_content_stream.side_effect = quota_error
        mock_get_client.return_value = mock_client

        try:
            list(ai_service.chat_stream([{"role": "user", "content": "hi"}], {}))
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "daily usage limit" in str(e)
            assert "quotaMetric" not in str(e)


def test_chat_stream_raises_when_not_configured():
    with patch.object(ai_service, "get_client", return_value=None):
        try:
            list(ai_service.chat_stream([{"role": "user", "content": "hi"}], {}))
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass


def test_chat_stream_maps_roles_and_yields_text_chunks():
    with patch.object(ai_service, "get_client") as mock_get_client:
        mock_client = MagicMock()
        chunk1 = MagicMock()
        chunk1.text = "Hello"
        chunk2 = MagicMock()
        chunk2.text = " there"
        mock_client.models.generate_content_stream.return_value = [chunk1, chunk2]
        mock_get_client.return_value = mock_client

        messages = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hey"},
        ]
        chunks = list(ai_service.chat_stream(messages, {}))

    assert chunks == ["Hello", " there"]
    call_kwargs = mock_client.models.generate_content_stream.call_args.kwargs
    assert call_kwargs["contents"] == [
        {"role": "user", "parts": [{"text": "hi"}]},
        {"role": "model", "parts": [{"text": "hey"}]},
    ]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
