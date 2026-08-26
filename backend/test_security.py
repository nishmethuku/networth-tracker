"""
Security response headers and the X-Request-ID trace header, applied via
app.py's after_request hooks. Uses a real Flask app (create_app() only
needs DATABASE_URL to be *set*, not a live connection -- SQLAlchemy is
lazy, and every route exercised here returns before touching the DB) so
the actual hooks run, not a reimplementation of them.
"""

import pytest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")
    from backend.app import create_app

    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_security_headers_present_on_a_normal_route(client):
    # A nonexistent path still runs after_request (404 is a normal response).
    resp = client.get("/holdings")
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert resp.headers["Content-Security-Policy"] == "default-src 'none'"


def test_security_headers_absent_on_internal_routes(client):
    resp = client.post("/internal/snapshot")
    assert "X-Frame-Options" not in resp.headers
    assert "Content-Security-Policy" not in resp.headers


def test_request_id_header_present_on_every_response(client):
    resp = client.get("/holdings")
    assert resp.headers.get("X-Request-ID")


def test_request_id_echoes_a_caller_supplied_value(client):
    resp = client.get("/holdings", headers={"X-Request-ID": "test-trace-123"})
    assert resp.headers["X-Request-ID"] == "test-trace-123"


def test_unsubscribe_route_escapes_email_in_html_response(client, monkeypatch):
    # Regression: the route used to interpolate the unsubscribed email
    # straight into an HTML response with no escaping. A valid HMAC means
    # this can only ever be an email a token was genuinely issued for (see
    # unsubscribe_service.generate/verify_unsubscribe_token), but that's
    # defense in depth, not a reason to skip escaping externally-influenced
    # data before it lands in an HTML response.
    from unittest.mock import patch

    from backend import unsubscribe_service as svc

    monkeypatch.setattr(svc, "_SECRET", b"test-secret")
    token = svc.generate_unsubscribe_token('"><script>alert(1)</script>@example.com')

    with patch("backend.app.unsubscribe_email"):
        resp = client.get(f"/internal/unsubscribe?token={token}")

    assert b"<script>" not in resp.data
    assert b"&lt;script&gt;" in resp.data
