import sys
import os
from unittest.mock import patch

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


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
