"""
Cross-user (tenant isolation) tests against a REAL Postgres.

The Flask backend connects to the database directly, so Postgres row-level
security does not protect it: every route must scope its own queries. This
file proves that. User A creates data through the real API, then user B
(a different, validly signed-in user) tries to read, change, delete and
link to it through every route that takes an id. Each attempt must be
refused, and afterwards A's data must be exactly as it was.

Runs only when TENANT_TEST_DATABASE_URL points at a LOCAL Postgres (the
test wipes and rebuilds every table). Skipped otherwise, so the normal
mocked suite stays database-free.

Local:   TENANT_TEST_DATABASE_URL=postgresql://postgres@localhost:5544/scratch?host=/tmp/pgscratch
CI:      the backend-tenant-isolation job in .github/workflows/ci.yml
"""
import os
import time
import uuid
from urllib.parse import urlparse

import pytest

DB_URL = os.environ.get("TENANT_TEST_DATABASE_URL")


def _is_local(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.hostname in ("localhost", "127.0.0.1", "::1") or "host=/" in (parsed.query or "")


pytestmark = pytest.mark.skipif(
    not DB_URL or not _is_local(DB_URL),
    reason="set TENANT_TEST_DATABASE_URL to a local Postgres to run the tenant isolation tests",
)

USER_A = str(uuid.UUID(int=0xA))
USER_B = str(uuid.UUID(int=0xB))
USER_C = str(uuid.UUID(int=0xC))
MARKER = "ZZ-TENANT-A-PRIVATE"
REFUSED = (403, 404)


@pytest.fixture(scope="module")
def client():
    os.environ["DATABASE_URL"] = DB_URL
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    import backend.auth as auth
    from backend.app import create_app
    from backend.models import db

    app = create_app()
    app.config["TESTING"] = True

    class _FakeKey:
        key = "unused"

    class _FakeJwks:
        def get_signing_key_from_jwt(self, token):
            return _FakeKey()

    real_decode = auth.jwt.decode

    users = {"token-a": USER_A, "token-b": USER_B, "token-c": USER_C, "token-c-stale": USER_C}

    def fake_decode(token, *args, **kwargs):
        if token in users:
            signed_in = int(time.time()) - (7200 if token.endswith("stale") else 30)
            return {
                "sub": users[token],
                "email": f"{token}@example.com",
                "aal": "aal2",
                "amr": [{"method": "password", "timestamp": signed_in}],
            }
        raise auth.jwt.InvalidTokenError("bad token")

    auth._get_jwks_client = lambda: _FakeJwks()
    auth.jwt.decode = fake_decode
    with app.app_context():
        db.drop_all()
        db.create_all()
    try:
        with app.test_client() as c:
            yield c
    finally:
        auth.jwt.decode = real_decode
        with app.app_context():
            db.session.remove()
            db.drop_all()


def call(client, token, method, path, body=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return getattr(client, method)(path, json=body, headers=headers) if body is not None else getattr(client, method)(path, headers=headers)


@pytest.fixture(scope="module")
def world(client):
    """Everything user A owns, created through the real API."""
    a = lambda method, path, body=None: call(client, "token-a", method, path, body)  # noqa: E731
    ids = {}

    r = a("post", "/holdings", {"asset_type": "stock", "name": f"{MARKER} holding", "country": "United States", "account": f"{MARKER} account", "currency": "USD", "symbol": "AAPL"})
    assert r.status_code == 201, r.get_json()
    ids["holding"] = r.get_json()["id"]

    r = a("post", f"/holdings/{ids['holding']}/transactions", {"transaction_type": "buy", "transaction_date": "2026-01-02", "quantity": 3, "price_per_unit": 100})
    assert r.status_code == 201, r.get_json()
    ids["transaction"] = r.get_json()["id"]

    r = a("post", f"/holdings/{ids['holding']}/valuations", {"valuation_date": "2026-01-03", "value": 500})
    assert r.status_code == 201, r.get_json()
    ids["valuation"] = r.get_json()["id"]

    r = a("post", "/liabilities", {"liability_type": "mortgage", "name": f"{MARKER} mortgage", "current_balance": 1000})
    assert r.status_code == 201, r.get_json()
    ids["liability"] = r.get_json()["id"]

    r = a("post", "/budget/categories", {"entry_type": "expense", "name": f"{MARKER} cat"})
    assert r.status_code == 201, r.get_json()
    ids["category"] = r.get_json()["id"]

    r = a("post", "/budget/limits", {"category": f"{MARKER} cat", "monthly_limit": 50})
    assert r.status_code == 201, r.get_json()
    ids["limit"] = r.get_json()["id"]

    r = a("post", "/budget/entries", {"entry_type": "expense", "category": f"{MARKER} cat", "entry_date": "2026-01-04", "amount": 12, "description": f"{MARKER} entry"})
    assert r.status_code == 201, r.get_json()
    ids["entry"] = r.get_json()["id"]

    r = a("post", "/goals", {"name": f"{MARKER} goal", "target_amount": 999})
    assert r.status_code == 201, r.get_json()
    ids["goal"] = r.get_json()["id"]

    r = a("post", "/alerts", {"alert_type": "net_worth_above", "threshold": 12345})
    assert r.status_code == 201, r.get_json()
    ids["alert"] = r.get_json()["id"]

    r = a("post", "/accounts", {"name": f"{MARKER} cash"})
    assert r.status_code == 201, r.get_json()
    ids["account"] = r.get_json()["id"]

    from datetime import date

    from backend.models import LinkedConnection, Milestone, db

    with client.application.app_context():
        conn = LinkedConnection(user_id=USER_A, provider="plaid", external_id="item-a", institution_name=f"{MARKER} bank", access_token_enc="secret-token")
        ms = Milestone(user_id=USER_A, threshold=1000, currency="USD", achieved_date=date(2026, 1, 1))
        db.session.add_all([conn, ms])
        db.session.commit()
        ids["connection"] = conn.id
        ids["milestone"] = ms.id
    return ids


def snapshot_of_a(client):
    """A's view of her own data, for before/after comparison."""
    out = {}
    for path in ("/holdings", "/liabilities", "/budget/entries", "/budget/categories", "/budget/limits", "/goals", "/alerts", "/accounts"):
        r = call(client, "token-a", "get", path)
        assert r.status_code == 200, (path, r.status_code)
        out[path] = r.get_json()
    return out


def attacks(ids):
    """(method, path, body) tuples user B tries on user A's records."""
    h, t, v, li = ids["holding"], ids["transaction"], ids["valuation"], ids["liability"]
    return [
        ("get", f"/holdings/{h}", None),
        ("put", f"/holdings/{h}", {"name": "pwned"}),
        ("delete", f"/holdings/{h}", None),
        ("get", f"/holdings/{h}/sip-projection", None),
        ("get", f"/holdings/{h}/transactions", None),
        ("post", f"/holdings/{h}/transactions", {"transaction_type": "buy", "transaction_date": "2026-02-01", "quantity": 1, "price_per_unit": 1}),
        ("put", f"/transactions/{t}", {"quantity": 999}),
        ("delete", f"/transactions/{t}", None),
        ("get", f"/holdings/{h}/valuations", None),
        ("post", f"/holdings/{h}/valuations", {"valuation_date": "2026-02-01", "value": 1}),
        ("delete", f"/valuations/{v}", None),
        ("get", f"/holdings/{h}/price-history", None),
        ("put", f"/liabilities/{li}", {"name": "pwned", "current_balance": 0}),
        ("post", f"/liabilities/{li}/payments", {"amount": 10}),
        ("delete", f"/liabilities/{li}", None),
        ("delete", f"/accounts/{ids['account']}", None),
        ("put", f"/goals/{ids['goal']}", {"name": "pwned", "target_amount": 1}),
        ("delete", f"/goals/{ids['goal']}", None),
        ("put", f"/budget/entries/{ids['entry']}", {"amount": 1}),
        ("delete", f"/budget/entries/{ids['entry']}", None),
        ("delete", f"/budget/categories/{ids['category']}", None),
        ("delete", f"/budget/limits/{ids['limit']}", None),
        ("delete", f"/alerts/{ids['alert']}", None),
        ("put", f"/milestones/{ids['milestone']}/acknowledge", None),
        ("post", f"/sync/connections/{ids['connection']}/pull", None),
        ("delete", f"/sync/connections/{ids['connection']}", None),
    ]


def test_user_b_is_refused_on_every_id_route(client, world):
    before = snapshot_of_a(client)
    failures = []
    for method, path, body in attacks(world):
        r = call(client, "token-b", method, path, body)
        if r.status_code not in REFUSED:
            failures.append(f"{method.upper()} {path} -> {r.status_code}")
    assert failures == [], "user B reached user A's data:\n" + "\n".join(failures)
    assert snapshot_of_a(client) == before, "user A's data changed after user B's attempts"


def test_user_b_cannot_link_new_records_to_user_a_records(client, world):
    b = lambda method, path, body=None: call(client, "token-b", method, path, body)  # noqa: E731
    # An expense pointing at A's liability / a transaction funded from A's holding
    # would otherwise move A's money.
    r = b("post", "/budget/entries", {"entry_type": "expense", "category": "food", "entry_date": "2026-02-01", "amount": 5, "linked_liability_id": world["liability"]})
    assert r.status_code in REFUSED + (400,), r.get_json()
    r = b("post", "/holdings", {"asset_type": "stock", "name": "mine", "country": "United States", "account": "x", "currency": "USD"})
    mine = r.get_json()["id"]
    r = b("post", f"/holdings/{mine}/transactions", {"transaction_type": "buy", "transaction_date": "2026-02-01", "quantity": 1, "price_per_unit": 10, "funding_source_holding_id": world["holding"]})
    assert r.status_code in REFUSED, r.get_json()
    r = b("post", "/alerts", {"alert_type": "price_above", "threshold": 1, "holding_id": world["holding"]})
    assert r.status_code in REFUSED, r.get_json()
    # Writing into a household the caller does not belong to.
    r = b("post", "/holdings", {"asset_type": "stock", "name": "x", "country": "United States", "account": "x", "currency": "USD", "household_id": str(uuid.uuid4())})
    assert r.status_code == 403
    r = b("get", f"/holdings?household_id={uuid.uuid4()}")
    assert r.status_code in REFUSED


def test_user_b_lists_and_exports_never_contain_user_a_data(client, world):
    for path in (
        "/holdings",
        "/transactions",
        "/liabilities",
        "/budget/entries",
        "/budget/categories",
        "/budget/limits",
        "/budget/summary",
        "/goals",
        "/alerts",
        "/accounts",
        "/milestones",
        "/dashboard",
        "/account/export",
        "/sync/status",
    ):
        r = call(client, "token-b", "get", path)
        assert r.status_code == 200, (path, r.status_code, r.get_data(as_text=True)[:200])
        text = r.get_data(as_text=True)
        assert MARKER not in text, f"{path} leaked user A's data to user B"
        assert "secret-token" not in text


def test_bank_tokens_are_never_returned_to_their_owner_either(client, world):
    r = call(client, "token-a", "get", "/sync/status")
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    assert "secret-token" not in body and "access_token" not in body


def test_requests_without_a_valid_token_are_rejected(client, world):
    for path in ("/holdings", f"/holdings/{world['holding']}", "/dashboard", "/account/export"):
        assert call(client, None, "get", path).status_code == 401
        assert call(client, "forged-token", "get", path).status_code == 401
    assert call(client, None, "delete", "/account").status_code == 401


def test_security_activity_is_private_and_records_sensitive_actions(client, world):
    a = lambda method, path, body=None: call(client, "token-a", method, path, body)  # noqa: E731
    b = lambda method, path, body=None: call(client, "token-b", method, path, body)  # noqa: E731

    assert a("get", "/account/export").status_code == 200
    r = a("get", "/account/security-activity")
    assert r.status_code == 200
    events = r.get_json()
    assert [e["event_type"] for e in events][0] == "data.exported"
    assert events[0]["label"] == "Downloaded a copy of your data"
    assert "user_agent" in events[0] and "created_at" in events[0]

    # Every row either person sees belongs to them, in the list and in the export.
    from backend.models import AuditEvent

    seen = []
    for fetch, me in ((a, USER_A), (b, USER_B)):
        seen += [(e["id"], me) for e in fetch("get", "/account/security-activity").get_json()]
        seen += [(e["id"], me) for e in fetch("get", "/account/export").get_json()["security_activity"]]
    owners = {row.id: str(row.user_id) for row in AuditEvent.query.all()}
    for event_id, me in seen:
        assert owners[event_id] == me
    assert any(owner == USER_A for owner in owners.values())


def test_the_security_log_has_no_edit_or_delete_route(client, world):
    for method in ("put", "patch", "delete", "post"):
        r = call(client, "token-a", method, "/account/security-activity", {"x": 1})
        assert r.status_code in (404, 405), (method, r.status_code)


def test_deleting_data_needs_a_recent_sign_in_and_stays_visible_in_the_log(client):
    c = lambda method, path, body=None: call(client, "token-c", method, path, body)  # noqa: E731
    stale = lambda method, path, body=None: call(client, "token-c-stale", method, path, body)  # noqa: E731

    r = c("post", "/liabilities", {"liability_type": "mortgage", "name": "C's loan", "current_balance": 5})
    assert r.status_code == 201

    # A session that signed in two hours ago cannot wipe data or the account.
    for method, path, confirm in (("delete", "/account/data", "DELETE"), ("delete", "/account", "DELETE ACCOUNT")):
        r = stale(method, path, {"confirm": confirm})
        assert r.status_code == 403 and r.get_json()["code"] == "recent_login_required", path
    assert len(c("get", "/liabilities").get_json()) == 1

    # A fresh sign-in can. The data goes, but the wipe itself is recorded.
    assert c("delete", "/account/data", {"confirm": "DELETE"}).status_code == 200
    assert c("get", "/liabilities").get_json() == []
    types = [e["event_type"] for e in c("get", "/account/security-activity").get_json()]
    assert types == ["data.deleted"]


def test_bank_and_household_actions_are_recorded(client, world):
    a = lambda method, path, body=None: call(client, "token-a", method, path, body)  # noqa: E731
    assert a("delete", f"/sync/connections/{world['connection']}").status_code == 200
    types = [e["event_type"] for e in a("get", "/account/security-activity").get_json()]
    assert "bank.disconnected" in types
