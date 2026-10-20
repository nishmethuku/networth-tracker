"""
Tests for require_auth's MFA step-up enforcement -- live-verified
end-to-end against the real Supabase project during development (enroll
-> verify -> fresh unchallenged sign-in correctly 401s with
mfa_required -> completing the challenge restores access), these tests
cover the same logic at the unit level so it stays covered going
forward without needing a live backend.

JWT signature verification itself isn't exercised here (that's
PyJWKClient/PyJWT's own job, not this app's code) -- these mock
jwt.decode's return value directly to test what require_auth does with
the resulting payload.
"""
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, g

from backend import auth


def _make_app():
    app = Flask(__name__)

    @app.route("/protected")
    @auth.require_auth
    def protected():
        return {"user_id": g.user_id}

    return app


def _run_with_payload(payload, has_mfa_factor=False):
    app = _make_app()
    client = app.test_client()
    with patch.object(auth, "_get_jwks_client", return_value=MagicMock()), \
         patch("jwt.decode", return_value=payload), \
         patch.object(auth, "_has_verified_mfa_factor", return_value=has_mfa_factor) as mock_has_mfa:
        response = client.get("/protected", headers={"Authorization": "Bearer faketoken"})
    return response, mock_has_mfa


def test_aal1_token_allowed_when_user_has_no_mfa_factor():
    response, mock_has_mfa = _run_with_payload({"sub": "u1", "email": "a@example.com", "aal": "aal1"}, has_mfa_factor=False)
    assert response.status_code == 200
    mock_has_mfa.assert_called_once_with("u1")


def test_aal1_token_rejected_when_user_has_a_verified_mfa_factor():
    """The core regression this file guards: a password-only (aal1) token
    must not grant API access once the user has actually enrolled and
    verified a TOTP factor -- otherwise 2FA only gates the login UI while
    a leaked/stolen access token still has full API access."""
    response, _ = _run_with_payload({"sub": "u1", "email": "a@example.com", "aal": "aal1"}, has_mfa_factor=True)
    assert response.status_code == 401
    assert response.get_json()["code"] == "mfa_required"


def test_aal2_token_allowed_without_checking_mfa_factor_status():
    """An already-stepped-up session skips the DB lookup entirely -- it's
    already proven the second factor for this session, so there's
    nothing left to gate, and this avoids a DB round-trip on every
    authenticated request for users who did complete the challenge."""
    response, mock_has_mfa = _run_with_payload({"sub": "u1", "email": "a@example.com", "aal": "aal2"}, has_mfa_factor=True)
    assert response.status_code == 200
    mock_has_mfa.assert_not_called()


def test_missing_authorization_header_returns_401():
    app = _make_app()
    client = app.test_client()
    response = client.get("/protected")
    assert response.status_code == 401


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
