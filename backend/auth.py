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
import time
from functools import wraps

import certifi
import jwt
from flask import g, jsonify, request
from jwt import PyJWKClient
from sqlalchemy import text

SUPABASE_URL = os.environ.get("SUPABASE_URL")


def _expected_issuer():
    """Supabase stamps every access token with iss = <project url>/auth/v1.
    Pinning it means a validly signed token from some other Supabase project
    (or any other issuer that shared a key) is not accepted here. Set
    SUPABASE_JWT_ISSUER to override if a custom auth domain is ever used."""
    override = os.environ.get("SUPABASE_JWT_ISSUER")
    if override:
        return override
    return f"{SUPABASE_URL.rstrip('/')}/auth/v1" if SUPABASE_URL else None

_jwks_client = None

# {user_id: (has_factor, timestamp)} -- same in-memory TTL cache pattern as
# utils.py's _PRICE_CACHE. Without this, _has_verified_mfa_factor ran a DB
# query on every single authenticated request from every user who has
# *not* enrolled 2FA (the common case, since it's opt-in and off by
# default) -- caught live when a transient Supabase connection timeout on
# this exact query 500'd an otherwise-unrelated request. A 2FA enrollment
# change takes up to the TTL to be picked up by an already-issued aal1
# token's next request in the worst case, which is an acceptable tradeoff
# for cutting a mandatory DB round-trip out of the common path entirely.
_MFA_FACTOR_CACHE = {}
_MFA_FACTOR_CACHE_TTL = 300  # 5 minutes in seconds


def _has_verified_mfa_factor(user_id: str) -> bool:
    """Whether this user has ever completed TOTP enrollment -- imported
    here (not at module level) to avoid auth.py, a standalone JWT-
    verification module by design, depending on the ORM/DB layer except
    for this one check. Supabase manages auth.mfa_factors itself; this
    app only reads it."""
    now = time.time()
    cached = _MFA_FACTOR_CACHE.get(user_id)
    if cached is not None and now - cached[1] < _MFA_FACTOR_CACHE_TTL:
        return cached[0]

    from .models import db

    row = db.session.execute(
        text("select 1 from auth.mfa_factors where user_id = :user_id and status = 'verified' limit 1"),
        {"user_id": user_id},
    ).first()
    has_factor = row is not None
    _MFA_FACTOR_CACHE[user_id] = (has_factor, now)
    return has_factor


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
                # Asymmetric algorithms only: never HS256 (a public key used as an
                # HMAC secret) and never "none". exp, sub, aud and iss must all be
                # present, not merely valid if present.
                algorithms=["ES256", "RS256"],
                audience="authenticated",
                issuer=_expected_issuer(),
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid token"}), 401

        # A user who has enrolled TOTP must actually have completed that
        # second factor for *this* session (aal2), not just have a valid
        # password-only (aal1) token -- otherwise 2FA only gates the
        # login UI while a stolen/leaked access token still has full API
        # access regardless. Users who never enrolled are unaffected:
        # their tokens are aal1 by design and this check is skipped for
        # aal2 tokens (already stepped up) to avoid a DB round-trip on
        # every single authenticated request.
        if payload.get("aal") == "aal1" and _has_verified_mfa_factor(payload["sub"]):
            return jsonify({"error": "Two-factor verification required", "code": "mfa_required"}), 401

        g.user_id = payload["sub"]
        g.user_email = payload.get("email")
        return fn(*args, **kwargs)

    return wrapper
