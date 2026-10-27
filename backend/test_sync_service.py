from datetime import date

import pytest
from cryptography.fernet import Fernet

from backend import sync_service
from backend.sync_service import ExternalTransaction, FakeProvider, PlaidProvider, SyncError, TokenVault, guess_category


def test_vault_round_trips_and_hides_the_token():
    vault = TokenVault(Fernet.generate_key().decode())
    stored = vault.encrypt("access-sandbox-123")
    assert "access-sandbox-123" not in stored
    assert vault.decrypt(stored) == "access-sandbox-123"


def test_vault_needs_a_key(monkeypatch):
    monkeypatch.delenv("SYNC_ENCRYPTION_KEY", raising=False)
    with pytest.raises(SyncError):
        TokenVault()
    with pytest.raises(SyncError):
        TokenVault("not-a-real-key")


def test_vault_rejects_a_token_from_another_key():
    a = TokenVault(Fernet.generate_key().decode())
    b = TokenVault(Fernet.generate_key().decode())
    with pytest.raises(SyncError):
        b.decrypt(a.encrypt("x"))


def test_syncing_is_off_without_a_provider(monkeypatch):
    monkeypatch.delenv("SYNC_PROVIDER", raising=False)
    assert sync_service.get_provider() is None


def test_unknown_provider_is_reported(monkeypatch):
    monkeypatch.setenv("SYNC_PROVIDER", "nope")
    with pytest.raises(SyncError):
        sync_service.get_provider()


def test_fake_provider_selected(monkeypatch):
    monkeypatch.setenv("SYNC_PROVIDER", "fake")
    assert isinstance(sync_service.get_provider(), FakeProvider)


@pytest.mark.parametrize(
    "text,kind,expected",
    [
        ("STARBUCKS #1234", "expense", "food"),
        ("Uber trip", "expense", "transport"),
        ("NETFLIX.COM", "expense", "entertainment"),
        ("Some Unknown Shop", "expense", "other_expense"),
        ("ACME PAYROLL DIRECT DEP", "income", "paycheck"),
        ("Venmo from friend", "income", "other_income"),
    ],
)
def test_category_guess(text, kind, expected):
    assert guess_category(text, kind) == expected


class _Resp:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body or {}

    def json(self):
        return self._body


def test_plaid_needs_keys(monkeypatch):
    monkeypatch.delenv("PLAID_CLIENT_ID", raising=False)
    monkeypatch.delenv("PLAID_SECRET", raising=False)
    with pytest.raises(SyncError):
        PlaidProvider()


def test_plaid_rejects_unknown_environment():
    with pytest.raises(SyncError):
        PlaidProvider("id", "secret", "moon")


def test_plaid_pull_follows_pages_and_maps_fields(monkeypatch):
    calls = []
    pages = [
        {
            "added": [{"transaction_id": "t1", "date": "2026-10-01", "amount": 12.5, "merchant_name": "Starbucks", "pending": False}],
            "next_cursor": "c1",
            "has_more": True,
        },
        {
            "added": [{"transaction_id": "t2", "date": "2026-10-02", "amount": -2000, "name": "ACME PAYROLL", "iso_currency_code": "USD", "pending": True}],
            "next_cursor": "c2",
            "has_more": False,
        },
    ]

    def fake_post(url, json=None, timeout=None):
        calls.append((url, json))
        return _Resp(200, pages[len(calls) - 1])

    monkeypatch.setattr(sync_service.requests, "post", fake_post)
    result = PlaidProvider("id", "secret", "sandbox").pull_transactions("tok", None)
    assert [t.external_id for t in result.added] == ["t1", "t2"]
    assert result.added[0].description == "Starbucks" and result.added[0].amount == 12.5
    assert result.added[1].pending is True and result.added[1].date == date(2026, 10, 2)
    assert result.next_cursor == "c2"
    assert calls[0][0] == "https://sandbox.plaid.com/transactions/sync"
    assert "cursor" not in calls[0][1] and calls[1][1]["cursor"] == "c1"
    assert calls[0][1]["secret"] == "secret"


def test_plaid_login_required_gives_a_friendly_error(monkeypatch):
    monkeypatch.setattr(sync_service.requests, "post", lambda *a, **k: _Resp(400, {"error_code": "ITEM_LOGIN_REQUIRED"}))
    with pytest.raises(SyncError, match="sign in again"):
        PlaidProvider("id", "secret").pull_transactions("tok", None)


def test_plaid_network_failure_is_a_sync_error(monkeypatch):
    def boom(*a, **k):
        raise sync_service.requests.ConnectionError("down")

    monkeypatch.setattr(sync_service.requests, "post", boom)
    with pytest.raises(SyncError):
        PlaidProvider("id", "secret").create_link_token("u1")


def test_external_transaction_sign_convention():
    spend = ExternalTransaction("a", date(2026, 1, 1), 5.0, "x")
    pay = ExternalTransaction("b", date(2026, 1, 1), -5.0, "y")
    assert spend.amount > 0 > pay.amount
