"""
Real-signature tests for require_auth.

test_auth.py fakes jwt.decode to test what happens with a payload. These
tests do the opposite: they sign real ES256 tokens with real keys and send
the classic token attacks at the real verification path, so a regression in
how the token itself is checked would fail here.
"""
import base64
import json
import os
import sys
import time
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from flask import Flask, g

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import auth  # noqa: E402

PROJECT = "https://abc123.supabase.co"
ISSUER = f"{PROJECT}/auth/v1"
TRUSTED_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


class _Signing:
    def __init__(self, key):
        self.key = key


class _Jwks:
    """Stands in for the project's published key set: only the trusted public key."""

    def get_signing_key_from_jwt(self, token):
        return _Signing(TRUSTED_KEY.public_key())


def claims(**over):
    base = {"sub": "user-1", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 600, "aal": "aal2", "email": "u@example.com"}
    base.update(over)
    return {k: v for k, v in base.items() if v is not None}


def sign(payload, key=TRUSTED_KEY, alg="ES256"):
    return jwt.encode(payload, key, algorithm=alg)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "SUPABASE_URL", PROJECT)
    monkeypatch.delenv("SUPABASE_JWT_ISSUER", raising=False)
    app = Flask(__name__)

    @app.route("/protected")
    @auth.require_auth
    def protected():
        return {"user_id": g.user_id}

    with patch.object(auth, "_get_jwks_client", return_value=_Jwks()):
        yield app.test_client()


def get(client, token):
    return client.get("/protected", headers={"Authorization": f"Bearer {token}"})


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


def test_a_correctly_signed_token_is_accepted(client):
    r = get(client, sign(claims()))
    assert r.status_code == 200
    assert r.get_json() == {"user_id": "user-1"}


def test_a_token_signed_by_a_different_key_is_rejected(client):
    assert get(client, sign(claims(), key=OTHER_KEY)).status_code == 401


def test_an_expired_token_is_rejected(client):
    r = get(client, sign(claims(exp=int(time.time()) - 5)))
    assert r.status_code == 401
    assert r.get_json()["error"] == "Token expired"


def test_a_token_without_an_expiry_is_rejected(client):
    assert get(client, sign(claims(exp=None))).status_code == 401


def test_a_token_without_a_subject_is_rejected(client):
    assert get(client, sign(claims(sub=None))).status_code == 401


def test_the_wrong_audience_is_rejected(client):
    assert get(client, sign(claims(aud="service_role"))).status_code == 401


def test_the_wrong_issuer_is_rejected(client):
    assert get(client, sign(claims(iss="https://other-project.supabase.co/auth/v1"))).status_code == 401


def test_a_token_without_an_issuer_is_rejected(client):
    assert get(client, sign(claims(iss=None))).status_code == 401


def test_alg_none_is_rejected(client):
    unsigned = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(claims())}."
    assert get(client, unsigned).status_code == 401


def test_hs256_signed_with_the_public_key_is_rejected(client):
    """Key confusion: sign with HMAC using the public key bytes as the secret."""
    public_pem = TRUSTED_KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    header = b64({"alg": "HS256", "typ": "JWT"})
    body = b64(claims())
    import hashlib
    import hmac

    sig = base64.urlsafe_b64encode(hmac.new(public_pem, f"{header}.{body}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    assert get(client, f"{header}.{body}.{sig}").status_code == 401


def test_a_tampered_payload_is_rejected(client):
    header, _, sig = sign(claims()).split(".")
    forged = b64(claims(sub="someone-else"))
    assert get(client, f"{header}.{forged}.{sig}").status_code == 401


def test_garbage_and_missing_tokens_are_rejected(client):
    assert get(client, "not-a-jwt").status_code == 401
    assert client.get("/protected").status_code == 401
    assert client.get("/protected", headers={"Authorization": "Basic abc"}).status_code == 401


def test_the_issuer_can_be_overridden_for_a_custom_auth_domain(client, monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://auth.example.com/auth/v1")
    assert get(client, sign(claims(iss="https://auth.example.com/auth/v1"))).status_code == 200
    assert get(client, sign(claims())).status_code == 401


def test_a_trailing_slash_in_the_project_url_does_not_break_the_issuer(client, monkeypatch):
    monkeypatch.setattr(auth, "SUPABASE_URL", PROJECT + "/")
    assert get(client, sign(claims())).status_code == 200
