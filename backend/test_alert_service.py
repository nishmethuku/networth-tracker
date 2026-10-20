"""
Tests for alert_service.check_all_alerts -- specifically the
currency-conversion defense for price alerts whose stored currency
doesn't match the priced asset's actual home currency.
"""
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import alert_service


def _alert(**overrides):
    defaults = dict(
        id=1, user_id="u1", holding_id=None, symbol="RELIANCE.NS", asset_type="stock",
        alert_type="price_above", threshold=1500.0, currency="USD", status="active",
    )
    defaults.update(overrides)
    alert = MagicMock(**defaults)
    alert.to_dict.return_value = {**defaults}
    return alert


def test_price_alert_converts_when_home_currency_differs_from_alert_currency():
    """Regression: get_current_price ignores its currency argument for
    stock/mutual_fund (always returns the home-exchange price), so a
    price_above/price_below alert stored with a different currency than
    the priced asset's actual home currency must have the fetched price
    converted before comparing against the threshold -- otherwise a USD
    threshold gets compared directly against a raw INR price."""
    alert = _alert(holding_id=42, symbol="RELIANCE.NS", currency="USD", threshold=15.0, alert_type="price_above")

    mock_alert_query = MagicMock()
    mock_alert_query.filter_by.return_value.all.return_value = [alert]

    with patch.object(alert_service, "PriceAlert") as mock_alert_model, \
         patch.object(alert_service, "price_service") as mock_price_service, \
         patch.object(alert_service, "db"), \
         patch.object(alert_service, "_user_email", return_value=None):
        mock_alert_model.query = mock_alert_query
        # 1400 INR "price" converts to 16.87 USD -- above the 15.0 USD threshold.
        mock_price_service.get_current_price.return_value = 1400.0
        mock_price_service.price_home_currency.return_value = "INR"
        mock_price_service.convert.return_value = 16.87

        result = alert_service.check_all_alerts()

    mock_price_service.price_home_currency.assert_called_once_with("stock", "RELIANCE.NS")
    mock_price_service.convert.assert_called_once_with(1400.0, "INR", "USD")
    assert result["alerts_triggered"] == 1
    assert alert.status == "triggered"


def test_price_alert_converts_even_without_a_linked_holding():
    """Regression: the conversion used to be gated on alert.holding_id
    being set (looking up a linked Holding's currency), so an alert
    created without one -- nothing in the creation route requires it --
    skipped conversion entirely and compared a raw, wrong-currency price
    straight against the threshold."""
    alert = _alert(holding_id=None, symbol="RELIANCE.NS", currency="USD", threshold=15.0, alert_type="price_above")

    mock_alert_query = MagicMock()
    mock_alert_query.filter_by.return_value.all.return_value = [alert]

    with patch.object(alert_service, "PriceAlert") as mock_alert_model, \
         patch.object(alert_service, "price_service") as mock_price_service, \
         patch.object(alert_service, "db"), \
         patch.object(alert_service, "_user_email", return_value=None):
        mock_alert_model.query = mock_alert_query
        mock_price_service.get_current_price.return_value = 1400.0
        mock_price_service.price_home_currency.return_value = "INR"
        mock_price_service.convert.return_value = 16.87

        result = alert_service.check_all_alerts()

    mock_price_service.convert.assert_called_once_with(1400.0, "INR", "USD")
    assert result["alerts_triggered"] == 1


def test_price_alert_skips_conversion_when_currencies_already_match():
    alert = _alert(holding_id=42, symbol="AAPL", currency="USD", threshold=100.0, alert_type="price_above")

    mock_alert_query = MagicMock()
    mock_alert_query.filter_by.return_value.all.return_value = [alert]

    with patch.object(alert_service, "PriceAlert") as mock_alert_model, \
         patch.object(alert_service, "price_service") as mock_price_service, \
         patch.object(alert_service, "db"), \
         patch.object(alert_service, "_user_email", return_value=None):
        mock_alert_model.query = mock_alert_query
        mock_price_service.get_current_price.return_value = 150.0
        mock_price_service.price_home_currency.return_value = "USD"

        alert_service.check_all_alerts()

    mock_price_service.convert.assert_not_called()
    assert alert.status == "triggered"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
