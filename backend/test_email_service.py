import base64
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import email_service


def test_render_digest_email_without_narrative_or_unsubscribe():
    html = email_service.render_digest_email({"net_worth": 1000.0, "change_this_week": 50.0, "top_movers": []})
    assert "1,000.00" in html
    assert "Unsubscribe" not in html


def test_render_digest_email_includes_narrative_paragraphs():
    html = email_service.render_digest_email(
        {"net_worth": 1000.0, "change_this_week": None, "top_movers": []},
        narrative="Paragraph one.\n\nParagraph two.",
    )
    assert "Paragraph one." in html
    assert "Paragraph two." in html


def test_render_digest_email_includes_unsubscribe_link_when_backend_url_set():
    with patch.object(email_service, "BACKEND_URL", "https://api.example.com"):
        html = email_service.render_digest_email(
            {"net_worth": 1000.0, "change_this_week": None, "top_movers": []},
            unsubscribe_token="abc.def",
        )
    assert "https://api.example.com/internal/unsubscribe?token=abc.def" in html


def test_render_digest_email_omits_unsubscribe_link_without_backend_url():
    with patch.object(email_service, "BACKEND_URL", ""):
        html = email_service.render_digest_email(
            {"net_worth": 1000.0, "change_this_week": None, "top_movers": []},
            unsubscribe_token="abc.def",
        )
    assert "Unsubscribe" not in html


def test_render_digest_email_mentions_backup_only_when_attached():
    digest = {"net_worth": 1000.0, "change_this_week": None, "top_movers": []}
    with_backup = email_service.render_digest_email(digest, backup_attached=True)
    without_backup = email_service.render_digest_email(digest, backup_attached=False)
    assert "backup" in with_backup.lower()
    assert "backup" not in without_backup.lower()


def test_render_digest_email_escapes_a_holding_name_in_top_movers():
    # Regression: a holding's name is freeform user-entered (or CSV/AI-
    # imported) text, not a fixed enum -- for a household digest it can be
    # someone else's holding rendering in every member's inbox, so it must
    # be escaped rather than dropped straight into the HTML.
    digest = {
        "net_worth": 1000.0, "change_this_week": None,
        "top_movers": [{"name": "<img src=x onerror=alert(1)>", "unrealized_gain": 50.0}],
    }
    html = email_service.render_digest_email(digest)
    assert "<img src=x onerror" not in html
    assert "&lt;img src=x onerror" in html


def test_render_digest_email_escapes_the_ai_narrative():
    html = email_service.render_digest_email(
        {"net_worth": 1000.0, "change_this_week": None, "top_movers": []},
        narrative="Your <b>Fake Holding</b> did well.",
    )
    assert "<b>Fake Holding</b>" not in html
    assert "&lt;b&gt;Fake Holding&lt;/b&gt;" in html


def test_render_alert_email_escapes_the_symbol():
    alert = {"symbol": "<script>alert(1)</script>", "alert_type": "price_above", "threshold": 100.0, "currency": "USD"}
    html = email_service.render_alert_email(alert, 150.0)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_send_encodes_attachments_as_base64_for_resend():
    with patch.object(email_service, "RESEND_API_KEY", "test-key"), patch("backend.email_service.requests.post") as mock_post:
        mock_post.return_value = MagicMock(raise_for_status=lambda: None)
        email_service.send(
            "a@example.com", "Subject", "<p>Hi</p>",
            attachments=[("backup.zip", b"zip-bytes-here")],
        )
    payload = mock_post.call_args.kwargs["json"]
    assert payload["attachments"] == [
        {"filename": "backup.zip", "content": base64.b64encode(b"zip-bytes-here").decode("ascii")}
    ]


def test_send_omits_attachments_key_when_none_given():
    with patch.object(email_service, "RESEND_API_KEY", "test-key"), patch("backend.email_service.requests.post") as mock_post:
        mock_post.return_value = MagicMock(raise_for_status=lambda: None)
        email_service.send("a@example.com", "Subject", "<p>Hi</p>")
    payload = mock_post.call_args.kwargs["json"]
    assert "attachments" not in payload


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
