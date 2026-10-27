"""
Automatic bank syncing, kept independent of any one provider.

The rest of the app only knows the small `Provider` interface below. A real
provider (Plaid for banks, SnapTrade for brokers, ...) is one class that
fills it in and is switched on with the SYNC_PROVIDER environment variable.
With no provider configured, syncing is simply off and nothing changes.

Pulled transactions are normalised to `ExternalTransaction`, turned into
budget entries, and de-duplicated by the provider's own transaction id, so
syncing twice never adds the same purchase twice.
"""
import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Protocol

import requests
from cryptography.fernet import Fernet, InvalidToken

from .models import BudgetEntry, LinkedConnection, db

logger = logging.getLogger("networth_tracker")


class SyncError(Exception):
    """Something the user can be told about (provider down, token expired, not set up)."""


# ---------------------------------------------------------------------------
# Token storage
# ---------------------------------------------------------------------------
class TokenVault:
    """Encrypts provider access tokens before they reach the database.
    The key comes from SYNC_ENCRYPTION_KEY (generate one with
    `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)."""

    def __init__(self, key: Optional[str] = None):
        key = key or os.environ.get("SYNC_ENCRYPTION_KEY")
        if not key:
            raise SyncError("SYNC_ENCRYPTION_KEY is not set, so bank tokens cannot be stored safely.")
        try:
            self._fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except (ValueError, TypeError) as exc:
            raise SyncError("SYNC_ENCRYPTION_KEY is not a valid key.") from exc

    def encrypt(self, token: str) -> str:
        return self._fernet.encrypt(token.encode()).decode()

    def decrypt(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode()).decode()
        except InvalidToken as exc:
            raise SyncError("A stored bank token could not be read. Reconnect the bank.") from exc


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------
@dataclass
class ExternalTransaction:
    external_id: str
    date: date
    amount: float  # positive = money out (an expense), negative = money in (income)
    description: str
    currency: str = "USD"
    pending: bool = False


@dataclass
class PullResult:
    added: List[ExternalTransaction]
    next_cursor: Optional[str]


@dataclass
class ExchangeResult:
    access_token: str
    external_id: str
    institution_name: Optional[str] = None


class Provider(Protocol):
    name: str
    kind: str

    def create_link_token(self, user_id: str) -> str: ...

    def exchange_public_token(self, public_token: str) -> ExchangeResult: ...

    def pull_transactions(self, access_token: str, cursor: Optional[str]) -> PullResult: ...


class FakeProvider:
    """For tests and local demos. Needs no keys and makes no network calls."""

    name = "fake"
    kind = "bank"

    def __init__(self, transactions: Optional[List[ExternalTransaction]] = None):
        self.transactions = transactions or []

    def create_link_token(self, user_id: str) -> str:
        return f"fake-link-token-{user_id}"

    def exchange_public_token(self, public_token: str) -> ExchangeResult:
        return ExchangeResult(access_token=f"fake-access-{public_token}", external_id=f"fake-item-{public_token}", institution_name="Fake Bank")

    def pull_transactions(self, access_token: str, cursor: Optional[str]) -> PullResult:
        return PullResult(added=list(self.transactions), next_cursor="done")


class PlaidProvider:
    """Plaid (US and Canada banks and cards). Written against Plaid's public API
    docs and covered by tests that fake the network, but not yet run against a
    live Plaid account: do that first in Plaid's sandbox before trusting it."""

    name = "plaid"
    kind = "bank"

    def __init__(self, client_id: Optional[str] = None, secret: Optional[str] = None, env: Optional[str] = None):
        self.client_id = client_id or os.environ.get("PLAID_CLIENT_ID")
        self.secret = secret or os.environ.get("PLAID_SECRET")
        self.env = env or os.environ.get("PLAID_ENV", "sandbox")
        if not self.client_id or not self.secret:
            raise SyncError("PLAID_CLIENT_ID and PLAID_SECRET are not set.")
        self.base = {"sandbox": "https://sandbox.plaid.com", "production": "https://production.plaid.com"}.get(self.env)
        if not self.base:
            raise SyncError("PLAID_ENV must be 'sandbox' or 'production'.")

    def _post(self, path: str, payload: Dict) -> Dict:
        body = {"client_id": self.client_id, "secret": self.secret, **payload}
        try:
            resp = requests.post(f"{self.base}{path}", json=body, timeout=20)
        except requests.RequestException as exc:
            raise SyncError("Could not reach the bank connection service. Try again soon.") from exc
        if resp.status_code != 200:
            code = ""
            try:
                code = resp.json().get("error_code", "")
            except ValueError:
                pass
            if code == "ITEM_LOGIN_REQUIRED":
                raise SyncError("The bank needs you to sign in again. Reconnect it.")
            raise SyncError("The bank connection service returned an error.")
        return resp.json()

    def create_link_token(self, user_id: str) -> str:
        data = self._post(
            "/link/token/create",
            {
                "user": {"client_user_id": user_id},
                "client_name": "Net Worth",
                "products": ["transactions"],
                "country_codes": ["US"],
                "language": "en",
            },
        )
        return data["link_token"]

    def exchange_public_token(self, public_token: str) -> ExchangeResult:
        data = self._post("/item/public_token/exchange", {"public_token": public_token})
        return ExchangeResult(access_token=data["access_token"], external_id=data["item_id"])

    def pull_transactions(self, access_token: str, cursor: Optional[str]) -> PullResult:
        added: List[ExternalTransaction] = []
        has_more = True
        while has_more:
            payload: Dict = {"access_token": access_token}
            if cursor:
                payload["cursor"] = cursor
            data = self._post("/transactions/sync", payload)
            for t in data.get("added", []):
                added.append(
                    ExternalTransaction(
                        external_id=t["transaction_id"],
                        date=date.fromisoformat(t["date"]),
                        amount=float(t["amount"]),
                        description=t.get("merchant_name") or t.get("name") or "",
                        currency=t.get("iso_currency_code") or "USD",
                        pending=bool(t.get("pending")),
                    )
                )
            cursor = data.get("next_cursor") or cursor
            has_more = bool(data.get("has_more"))
        return PullResult(added=added, next_cursor=cursor)


def get_provider() -> Optional[Provider]:
    """The provider switched on by SYNC_PROVIDER, or None when syncing is off."""
    name = (os.environ.get("SYNC_PROVIDER") or "").strip().lower()
    if not name:
        return None
    if name == "plaid":
        return PlaidProvider()
    if name == "fake":
        return FakeProvider()
    raise SyncError(f"Unknown SYNC_PROVIDER '{name}'.")


# ---------------------------------------------------------------------------
# Turning bank transactions into budget entries
# ---------------------------------------------------------------------------
_EXPENSE_KEYWORDS = [
    ("housing", ("rent", "mortgage", "landlord", "property mgmt")),
    ("food", ("grocery", "market", "restaurant", "cafe", "coffee", "pizza", "doordash", "uber eats", "starbucks", "mcdonald", "trader joe", "whole foods")),
    ("transport", ("uber", "lyft", "shell", "exxon", "chevron", "gas station", "metro", "transit", "parking", "amtrak", "airlines")),
    ("utilities", ("electric", "water", "internet", "comcast", "verizon", "at&t", "t-mobile", "utility")),
    ("healthcare", ("pharmacy", "cvs", "walgreens", "clinic", "dental", "hospital", "doctor")),
    ("entertainment", ("netflix", "spotify", "hulu", "disney", "cinema", "theater", "steam", "playstation", "xbox")),
    ("shopping", ("amazon", "target", "walmart", "best buy", "ikea", "nike", "apple store")),
    ("education", ("tuition", "university", "bookstore", "coursera", "udemy")),
    ("insurance", ("insurance", "geico", "state farm", "allstate")),
]
_INCOME_KEYWORDS = [
    ("paycheck", ("payroll", "direct dep", "salary", "paycheck")),
    ("interest", ("interest",)),
    ("gift", ("gift",)),
]


def guess_category(description: str, entry_type: str) -> str:
    text = (description or "").lower()
    table = _EXPENSE_KEYWORDS if entry_type == "expense" else _INCOME_KEYWORDS
    for category, words in table:
        if any(w in text for w in words):
            return category
    return "other_expense" if entry_type == "expense" else "other_income"


def import_transactions(user_id, household_id, txs: List[ExternalTransaction]) -> Dict[str, int]:
    """Adds new, settled transactions as budget entries. Pending ones wait until
    they settle (the id can change), and ids already imported are skipped."""
    settled = [t for t in txs if not t.pending and t.amount != 0]
    pending = len(txs) - len(settled)
    ids = [t.external_id for t in settled]
    existing = set()
    if ids:
        rows = BudgetEntry.query.filter(BudgetEntry.user_id == user_id, BudgetEntry.external_id.in_(ids)).all()
        existing = {r.external_id for r in rows}
    added = 0
    seen = set(existing)
    for t in settled:
        if t.external_id in seen:
            continue
        seen.add(t.external_id)
        entry_type = "expense" if t.amount > 0 else "income"
        db.session.add(
            BudgetEntry(
                user_id=user_id,
                household_id=household_id,
                entry_type=entry_type,
                entry_date=t.date,
                amount=round(abs(t.amount), 2),
                currency=t.currency or "USD",
                category=guess_category(t.description, entry_type),
                description=(t.description or "")[:200] or None,
                external_id=t.external_id,
            )
        )
        added += 1
    db.session.commit()
    return {"added": added, "skipped_duplicates": len(settled) - added, "skipped_pending": pending}


# ---------------------------------------------------------------------------
# Connection lifecycle
# ---------------------------------------------------------------------------
def connect(provider: Provider, vault: TokenVault, user_id, household_id, public_token: str, institution_name: Optional[str] = None) -> LinkedConnection:
    result = provider.exchange_public_token(public_token)
    existing = LinkedConnection.query.filter_by(user_id=user_id, provider=provider.name, external_id=result.external_id).first()
    conn = existing or LinkedConnection(user_id=user_id, provider=provider.name, kind=provider.kind, external_id=result.external_id)
    conn.household_id = household_id
    conn.institution_name = institution_name or result.institution_name or conn.institution_name
    conn.access_token_enc = vault.encrypt(result.access_token)
    conn.status = "active"
    conn.last_error = None
    db.session.add(conn)
    db.session.commit()
    return conn


def pull(provider: Provider, vault: TokenVault, conn: LinkedConnection) -> Dict[str, int]:
    if conn.status == "disconnected" or not conn.access_token_enc:
        raise SyncError("This bank is disconnected.")
    try:
        token = vault.decrypt(conn.access_token_enc)
        result = provider.pull_transactions(token, conn.cursor)
    except SyncError as exc:
        conn.status = "error"
        conn.last_error = str(exc)
        db.session.commit()
        raise
    summary = import_transactions(conn.user_id, conn.household_id, result.added)
    conn.cursor = result.next_cursor
    conn.status = "active"
    conn.last_error = None
    conn.last_synced_at = datetime.now(timezone.utc)
    db.session.commit()
    return summary


def disconnect(conn: LinkedConnection) -> None:
    """Forget the stored token and stop syncing. (The provider's own access can also be revoked from their side.)"""
    conn.access_token_enc = None
    conn.cursor = None
    conn.status = "disconnected"
    db.session.commit()
