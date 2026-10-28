"""Rate limits are keyed by client address, so the app must read the real one behind Render's proxy
without letting a caller choose their own."""
import pytest


def make_app(monkeypatch, **env):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")
    for key in ("TRUSTED_PROXY_COUNT", "FLASK_ENV"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    from backend.app import create_app

    app = create_app()

    @app.route("/_whoami")
    def _whoami():
        from flask import request

        return request.remote_addr or ""

    return app


def whoami(app, forwarded=None, remote="10.0.0.9"):
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    return app.test_client().get("/_whoami", headers=headers, environ_overrides={"REMOTE_ADDR": remote}).get_data(as_text=True)


def test_the_real_client_is_read_from_the_trusted_end_of_the_header(monkeypatch):
    app = make_app(monkeypatch, TRUSTED_PROXY_COUNT="2")
    assert whoami(app, "203.0.113.7, 10.1.1.1") == "203.0.113.7"


def test_a_caller_cannot_choose_their_own_address(monkeypatch):
    app = make_app(monkeypatch, TRUSTED_PROXY_COUNT="2")
    # The caller sent "1.2.3.4"; the proxy then appended the real client and itself.
    assert whoami(app, "1.2.3.4, 203.0.113.7, 10.1.1.1") == "203.0.113.7"


def test_a_short_header_leaves_the_address_unchanged(monkeypatch):
    app = make_app(monkeypatch, TRUSTED_PROXY_COUNT="2")
    assert whoami(app, "1.2.3.4") == "10.0.0.9"
    assert whoami(app, None) == "10.0.0.9"


def test_it_is_off_by_default_outside_production(monkeypatch):
    app = make_app(monkeypatch)
    assert whoami(app, "203.0.113.7, 10.1.1.1") == "10.0.0.9"


def test_it_is_on_by_default_in_production(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")
    app = make_app(monkeypatch, FLASK_ENV="production")
    assert whoami(app, "203.0.113.7, 10.1.1.1") == "203.0.113.7"


@pytest.mark.parametrize("bad", ["abc", "-3", ""])
def test_a_bad_setting_never_crashes_the_app(monkeypatch, bad):
    app = make_app(monkeypatch, TRUSTED_PROXY_COUNT=bad)
    assert whoami(app, "203.0.113.7, 10.1.1.1") == "10.0.0.9"
