"""
The routes live in backend/routes/*.py but are registered on one app. These tests guard the
split: the route table keeps its size and key endpoints, and calling every route without a
login never crashes (a missing import or helper would show up as a 500 here).
"""
import pytest


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")
    from backend.app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app


def _rules(app):
    return [r for r in app.url_map.iter_rules() if r.endpoint != "static"]


def test_route_table_is_complete(app):
    rules = _rules(app)
    assert len(rules) >= 100
    paths = {r.rule for r in rules}
    for expected in (
        "/health",
        "/dashboard",
        "/holdings",
        "/budget/entries",
        "/budget/year",
        "/budget/recurring/log-due",
        "/liabilities/<int:liability_id>/payments",
        "/households",
        "/goals",
        "/api/ai/chat",
        "/alerts",
        "/accounts",
    ):
        assert expected in paths, expected


def test_endpoint_names_are_unique_and_viewable(app):
    names = [r.endpoint for r in _rules(app)]
    for name in set(names):
        assert callable(app.view_functions[name])


def test_no_route_crashes_without_a_login(app):
    crashed = []
    with app.test_client() as client:
        for rule in _rules(app):
            if rule.rule == "/health":  # reports 503 when the database is unreachable, as it should
                continue
            path = rule.rule
            for arg in rule.arguments:
                path = path.replace(f"<int:{arg}>", "1").replace(f"<{arg}>", "x")
            for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
                resp = client.open(path, method=method)
                if resp.status_code >= 500:
                    crashed.append(f"{method} {rule.rule} -> {resp.status_code}")
    assert crashed == []
