"""
require_recent_auth: dangerous actions need a sign-in within the last 15 minutes,
judged from the token's own authentication timestamps (the `amr` claim), using
real signed tokens through the real verification path.
"""
import os
import sys
import time
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from flask import Flask, g

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import auth  # noqa: E402

PROJECT = "https://abc123.supabase.co"
KEY = ec.generate_private_key(ec.SECP256R1())


class _Jwks:
    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": KEY.public_key()})()


def token(amr, **over):
    claims = {"sub": "user-1", "aud": "authenticated", "iss": f"{PROJECT}/auth/v1", "exp": int(time.time()) + 600, "aal": "aal2"}
    if amr is not None:
        claims["amr"] = amr
    claims.update(over)
    return jwt.encode(claims, KEY, algorithm="ES256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "SUPABASE_URL", PROJECT)
    app = Flask(__name__)

    @app.route("/danger")
    @auth.require_auth
    @auth.require_recent_auth(900)
    def danger():
        return {"ok": True, "user": g.user_id}

    with patch.object(auth, "_get_jwks_client", return_value=_Jwks()):
        yield app.test_client()


def call(client, tok):
    return client.get("/danger", headers={"Authorization": f"Bearer {tok}"})


def ago(seconds):
    return int(time.time()) - seconds


def test_a_fresh_sign_in_is_allowed(client):
    assert call(client, token([{"method": "password", "timestamp": ago(60)}])).status_code == 200


def test_a_stale_sign_in_is_refused_with_a_code_the_app_can_act_on(client):
    r = call(client, token([{"method": "password", "timestamp": ago(3600)}]))
    assert r.status_code == 403
    assert r.get_json()["code"] == "recent_login_required"


def test_the_newest_method_counts_so_a_fresh_two_step_code_is_enough(client):
    amr = [{"method": "password", "timestamp": ago(7200)}, {"method": "totp", "timestamp": ago(30)}]
    assert call(client, token(amr)).status_code == 200


def test_a_token_with_no_sign_in_time_is_refused(client):
    assert call(client, token(None)).status_code == 403
    assert call(client, token([])).status_code == 403


def test_unreadable_sign_in_times_are_ignored_not_trusted(client):
    bad = [{"method": "password", "timestamp": "9999999999"}, {"method": "x", "timestamp": True}, "nonsense", {"method": "y"}]
    assert call(client, token(bad)).status_code == 403


def test_a_refreshed_token_does_not_look_like_a_fresh_sign_in(client):
    """A brand-new token (iat just now) from an old sign-in must still be refused."""
    r = call(client, token([{"method": "password", "timestamp": ago(7200)}], iat=int(time.time())))
    assert r.status_code == 403


def test_the_window_edge(client):
    assert call(client, token([{"method": "password", "timestamp": ago(850)}])).status_code == 200
    assert call(client, token([{"method": "password", "timestamp": ago(950)}])).status_code == 403
