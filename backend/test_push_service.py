import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pywebpush import WebPushException

from backend import push_service


def _configured():
    return patch.multiple(push_service, VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv", VAPID_SUBJECT="mailto:a@b.com")


def test_send_to_user_logs_instead_of_sending_when_not_configured():
    with patch.object(push_service, "VAPID_PRIVATE_KEY", None), patch("backend.push_service.webpush") as mock_webpush:
        sent = push_service.send_to_user("u1", "Title", "Body")
    assert sent == 0
    mock_webpush.assert_not_called()


def test_send_to_user_sends_to_every_subscription():
    sub1 = MagicMock(id=1, endpoint="https://push.example.com/1", p256dh="p1", auth="a1")
    sub2 = MagicMock(id=2, endpoint="https://push.example.com/2", p256dh="p2", auth="a2")
    mock_query = MagicMock()
    mock_query.filter_by.return_value.all.return_value = [sub1, sub2]
    mock_model = MagicMock(query=mock_query)

    # Patched by module-level name (push_service's own reference), not
    # PushSubscription.query directly -- that's a Flask-SQLAlchemy
    # descriptor that needs a live app context just to be read, which
    # patch.object would otherwise require to restore the original value.
    with _configured(), \
         patch.object(push_service, "PushSubscription", mock_model), \
         patch("backend.push_service.webpush") as mock_webpush:
        sent = push_service.send_to_user("u1", "Title", "Body", url="/alerts")

    assert sent == 2
    assert mock_webpush.call_count == 2
    first_call = mock_webpush.call_args_list[0].kwargs
    assert first_call["subscription_info"]["endpoint"] == "https://push.example.com/1"
    assert first_call["vapid_claims"] == {"sub": "mailto:a@b.com"}


def test_send_to_user_deletes_expired_subscription_on_410():
    sub = MagicMock(id=1, endpoint="https://push.example.com/gone", p256dh="p1", auth="a1")
    mock_query = MagicMock()
    mock_query.filter_by.return_value.all.return_value = [sub]
    mock_model = MagicMock(query=mock_query)
    gone_response = MagicMock(status_code=410)

    with _configured(), \
         patch.object(push_service, "PushSubscription", mock_model), \
         patch("backend.push_service.webpush", side_effect=WebPushException("gone", response=gone_response)), \
         patch.object(push_service, "db") as mock_db:
        sent = push_service.send_to_user("u1", "Title", "Body")

    assert sent == 0
    mock_db.session.delete.assert_called_once_with(sub)
    mock_db.session.commit.assert_called_once()


def test_send_to_user_keeps_subscription_on_a_non_expiry_error():
    sub = MagicMock(id=1, endpoint="https://push.example.com/1", p256dh="p1", auth="a1")
    mock_query = MagicMock()
    mock_query.filter_by.return_value.all.return_value = [sub]
    mock_model = MagicMock(query=mock_query)
    server_error_response = MagicMock(status_code=500)

    with _configured(), \
         patch.object(push_service, "PushSubscription", mock_model), \
         patch("backend.push_service.webpush", side_effect=WebPushException("server error", response=server_error_response)), \
         patch.object(push_service, "db") as mock_db:
        sent = push_service.send_to_user("u1", "Title", "Body")

    assert sent == 0
    mock_db.session.delete.assert_not_called()


def test_send_to_endpoint_sends_only_to_the_matching_subscription():
    sub = MagicMock(id=1, endpoint="https://push.example.com/this-device", p256dh="p1", auth="a1")
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = sub
    mock_model = MagicMock(query=mock_query)

    with _configured(), patch.object(push_service, "PushSubscription", mock_model), patch("backend.push_service.webpush") as mock_webpush:
        result = push_service.send_to_endpoint("u1", "https://push.example.com/this-device", "Test", "Body")

    assert result is True
    mock_query.filter_by.assert_called_once_with(endpoint="https://push.example.com/this-device", user_id="u1")
    mock_webpush.assert_called_once()


def test_send_to_endpoint_scoped_to_the_calling_user_not_just_any_endpoint():
    """A user can't test/probe another user's subscription by guessing or
    reusing an endpoint -- the lookup is filtered by user_id too, so a
    mismatched owner returns nothing to send to, same as if the
    subscription didn't exist at all."""
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None
    mock_model = MagicMock(query=mock_query)

    with _configured(), patch.object(push_service, "PushSubscription", mock_model), patch("backend.push_service.webpush") as mock_webpush:
        result = push_service.send_to_endpoint("attacker", "https://push.example.com/someone-elses", "Test", "Body")

    assert result is False
    mock_webpush.assert_not_called()


def test_send_to_endpoint_logs_instead_of_sending_when_not_configured():
    with patch.object(push_service, "VAPID_PRIVATE_KEY", None), patch("backend.push_service.webpush") as mock_webpush:
        result = push_service.send_to_endpoint("u1", "https://push.example.com/x", "Test", "Body")
    assert result is False
    mock_webpush.assert_not_called()


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
