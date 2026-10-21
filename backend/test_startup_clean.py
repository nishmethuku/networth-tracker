"""
Verify that the Flask app factory makes no network connections at startup.

A network call at module import time or inside create_app() blocks every
gunicorn worker (or the master with --preload) before it can serve requests,
causing a silent outage. This file guards against regressions.
"""
from unittest.mock import patch

import pytest


def test_mftool_not_initialized_at_module_import():
    """utils.mf must be None at import time.

    Mftool.__init__ calls get_scheme_codes(), which fetches the full AMFI
    scheme list over HTTP.  Running that at module import blocks the
    gunicorn worker before it can accept requests.  get_mf_instance() in
    utils.py defers initialization to the first search request."""
    from backend import utils

    assert utils.mf is None, (
        "backend.utils.mf is not None at import time — Mftool() fetches AMFI "
        "scheme codes over HTTP at __init__ and must not run during import "
        "(it blocks gunicorn workers before they can serve requests)."
    )


def test_create_app_makes_no_network_connections(monkeypatch):
    """create_app() must not open any sockets.

    SQLAlchemy's connection pool is lazy (no connections at factory time),
    mftool is deferred to first use, and no other library should connect
    at startup.  A violation here means a cold-start network dependency that
    can silently take down the backend."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/test")

    connections: list = []

    def _block(address, *args, **kwargs):
        connections.append(address)
        raise OSError("test guard: unexpected network call during create_app()")

    from backend.app import create_app

    with patch("socket.create_connection", side_effect=_block):
        try:
            create_app()
        except OSError:
            pytest.fail(
                f"create_app() attempted a network connection at startup — "
                f"this blocks gunicorn workers before they can serve requests. "
                f"Connection(s) attempted: {connections}"
            )

    assert connections == []
