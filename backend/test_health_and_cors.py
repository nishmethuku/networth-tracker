"""
/health reports which commit is running (so a post-deploy check can tell the
new version from the old one), and a production boot without FRONTEND_URL
warns that CORS is open to every origin.
"""
import logging
from unittest.mock import patch

import pytest


@pytest.fixture
def make_app(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")

    def _make():
        from backend.app import create_app

        app = create_app()
        app.config["TESTING"] = True
        return app

    return _make


def test_health_reports_ok_with_the_running_commit(make_app, monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "90d388f220a4bbba6c989881875bd86734b30aff")
    app = make_app()
    from backend.models import db

    with patch.object(db.session, "execute"), app.test_client() as c:
        resp = c.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok", "commit": "90d388f220a4"}


def test_health_commit_is_null_when_not_on_render(make_app, monkeypatch):
    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    app = make_app()
    from backend.models import db

    with patch.object(db.session, "execute"), app.test_client() as c:
        assert c.get("/health").get_json() == {"status": "ok", "commit": None}


def test_health_is_503_degraded_when_the_database_fails(make_app, monkeypatch):
    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    app = make_app()
    from backend.models import db

    with patch.object(db.session, "execute", side_effect=RuntimeError("db down")), app.test_client() as c:
        resp = c.get("/health")
    assert resp.status_code == 503
    assert resp.get_json()["status"] == "degraded"


def test_production_without_frontend_url_warns_about_open_cors(make_app, monkeypatch, caplog):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    with caplog.at_level(logging.WARNING, logger="networth_tracker"):
        make_app()
    assert any("FRONTEND_URL is not set" in r.getMessage() for r in caplog.records)


def test_production_with_frontend_url_does_not_warn(make_app, monkeypatch, caplog):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("FRONTEND_URL", "https://example.vercel.app")
    with caplog.at_level(logging.WARNING, logger="networth_tracker"):
        make_app()
    assert not any("FRONTEND_URL is not set" in r.getMessage() for r in caplog.records)
