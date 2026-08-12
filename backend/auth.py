"""
Supabase JWT verification for Flask.

Flask connects to Supabase Postgres directly via SQLAlchemy (using a direct
connection string), so Postgres RLS is not automatically enforced for these
queries — RLS only applies to clients that connect as the `authenticated`
role through Supabase's own API layer. This module is the actual
authorization boundary for the Flask API: every protected route uses
`require_auth`, which verifies the caller's Supabase access token and
exposes `g.user_id` / `g.user_email` for routes to scope their queries by.

Verification is via Supabase's JWKS endpoint (asymmetric ES256/RS256, the
current default for Supabase projects). We pass certifi's CA bundle
explicitly rather than relying on the system trust store, since Python on
macOS (and some minimal Linux images) doesn't always have one configured,
which otherwise surfaces as an opaque SSL certificate verification failure.
"""
import os
import ssl
from functools import wraps

import certifi
import jwt
from flask import g, jsonify, request
from jwt import PyJWKClient

SUPABASE_URL = os.environ.get("SUPABASE_URL")

_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None and SUPABASE_URL:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        _jwks_client = PyJWKClient(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            ssl_context=ssl_context,
        )
    return _jwks_client


def _extract_token():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer "):].strip()


def require_auth(fn):
    """Verify the Supabase access token on this request.

    On success, sets g.user_id (Supabase auth.users.id, a uuid string) and
    g.user_email, then calls the wrapped view. On failure, short-circuits
    with a 401 (or 500 if the server itself is misconfigured).
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Missing Authorization header"}), 401

        jwks_client = _get_jwks_client()
        if not jwks_client:
            return jsonify({"error": "Server misconfigured: SUPABASE_URL not set"}), 500

        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid token"}), 401

        g.user_id = payload["sub"]
        g.user_email = payload.get("email")
        return fn(*args, **kwargs)

    return wrapper
