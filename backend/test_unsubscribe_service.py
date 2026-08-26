import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch

from backend import unsubscribe_service as svc


def test_token_roundtrips_to_original_email():
    with patch.object(svc, "_SECRET", b"test-secret"):
        token = svc.generate_unsubscribe_token("User@Example.com")
        assert svc.verify_unsubscribe_token(token) == "user@example.com"


def test_tampered_token_rejected():
    with patch.object(svc, "_SECRET", b"test-secret"):
        token = svc.generate_unsubscribe_token("user@example.com")
        email_b64, _, sig = token.partition(".")
        tampered = f"{email_b64}.{'0' * len(sig)}"
        assert svc.verify_unsubscribe_token(tampered) is None


def test_token_signed_with_different_secret_rejected():
    with patch.object(svc, "_SECRET", b"secret-a"):
        token = svc.generate_unsubscribe_token("user@example.com")
    with patch.object(svc, "_SECRET", b"secret-b"):
        assert svc.verify_unsubscribe_token(token) is None


def test_malformed_token_rejected():
    with patch.object(svc, "_SECRET", b"test-secret"):
        assert svc.verify_unsubscribe_token("not-a-real-token") is None
        assert svc.verify_unsubscribe_token("") is None
        assert svc.verify_unsubscribe_token(None) is None


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
