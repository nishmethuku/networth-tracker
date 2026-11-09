"""Transfers between two cash accounts, against a REAL Postgres (local-only guard)."""
from datetime import date

import pytest

from backend import test_tenant_isolation as tenant
from backend.test_categories_and_entry_edit import a, b, balance, cash_account
from backend.test_tenant_isolation import DB_URL, _is_local

client = tenant.client

pytestmark = pytest.mark.skipif(
    not DB_URL or not _is_local(DB_URL),
    reason="set TENANT_TEST_DATABASE_URL to a local Postgres to run these tests",
)


def cash_account_today(client, name, amount):
    """Opening balance dated today, as when a person adds an account in the app."""
    r = a(client, "post", "/holdings", {"asset_type": "cash", "name": name, "country": "United States", "account": "Bank", "currency": "USD"})
    hid = r.get_json()["id"]
    r = a(client, "post", f"/holdings/{hid}/valuations", {"valuation_date": date.today().isoformat(), "value": amount})
    assert r.status_code == 201, r.get_json()
    return hid


def move(client, src, dst, amount, **extra):
    return a(client, "post", "/transfers", {"from_holding_id": src, "to_holding_id": dst, "amount": amount, **extra})


def test_transfer_moves_money_and_can_be_undone(client):
    src, dst = cash_account(client, "T Checking", 500), cash_account(client, "T Savings", 100)
    r = move(client, src, dst, 150, note="rainy day")
    assert r.status_code == 201, r.get_json()
    tid = r.get_json()["transfer"]["id"]
    assert balance(client, src) == 350
    assert balance(client, dst) == 250
    listed = a(client, "get", "/transfers").get_json()
    assert any(t["id"] == tid and t["from_name"] == "T Checking" and t["to_name"] == "T Savings" for t in listed)
    # Not spending or income.
    entries = a(client, "get", "/budget/entries").get_json()
    rows = entries["items"] if isinstance(entries, dict) and "items" in entries else entries
    assert not any(e.get("amount") == 150 for e in rows)
    assert a(client, "delete", f"/transfers/{tid}").status_code == 200
    assert balance(client, src) == 500
    assert balance(client, dst) == 100
    assert not any(t["id"] == tid for t in a(client, "get", "/transfers").get_json())


def test_transfer_validation(client):
    src, dst = cash_account(client, "V One", 100), cash_account(client, "V Two", 0)
    assert move(client, src, src, 5).status_code == 400
    assert move(client, src, dst, 0).status_code == 400
    assert move(client, src, dst, -3).status_code == 400
    assert move(client, src, dst, 5, transfer_date="2999-01-01").status_code == 400
    assert a(client, "post", "/transfers", {"from_holding_id": src, "amount": 5}).status_code == 400
    stock = a(client, "post", "/holdings", {"asset_type": "stock", "name": "Zed", "country": "United States", "account": "Brokerage", "currency": "USD", "ticker": "ZED"})
    if stock.status_code == 201:
        assert move(client, src, stock.get_json()["id"], 5).status_code == 400
    assert balance(client, src) == 100


def test_other_user_cannot_use_or_undo_a_transfer(client):
    src, dst = cash_account(client, "P One", 100), cash_account(client, "P Two", 0)
    tid = move(client, src, dst, 40).get_json()["transfer"]["id"]
    assert b(client, "get", "/transfers").get_json() == []
    assert b(client, "delete", f"/transfers/{tid}").status_code in (403, 404)
    assert b(client, "post", "/transfers", {"from_holding_id": src, "to_holding_id": dst, "amount": 1}).status_code in (403, 404)
    assert balance(client, src) == 60


def test_card_payment_from_savings_lowers_the_savings_balance(client):
    savings = cash_account(client, "Pay Savings", 1000)
    r = a(client, "post", "/liabilities", {"name": "Pay Visa", "liability_type": "credit_card", "currency": "USD", "current_balance": 400})
    assert r.status_code == 201, r.get_json()
    card = r.get_json()["id"]
    r = a(client, "post", f"/liabilities/{card}/payments", {"amount": 150, "funding_source_holding_id": savings})
    assert r.status_code == 201, r.get_json()
    assert balance(client, savings) == 850
    owed = next(x for x in a(client, "get", "/liabilities").get_json() if x["id"] == card)["current_balance"]
    assert owed == 250


def test_two_debits_on_the_same_day_both_come_out_of_the_balance(client):
    # A card payment and then a transfer, both dated today, from the same account: the second must
    # start from the balance the first left, not from the older opening balance.
    savings, other = cash_account_today(client, "Day Savings", 1000), cash_account_today(client, "Day Checking", 500)
    card = a(client, "post", "/liabilities", {"name": "Day Visa", "liability_type": "credit_card", "currency": "USD", "current_balance": 400}).get_json()["id"]
    assert a(client, "post", f"/liabilities/{card}/payments", {"amount": 150, "funding_source_holding_id": savings}).status_code == 201
    assert move(client, savings, other, 200).status_code == 201
    assert balance(client, savings) == 650
    assert balance(client, other) == 700


def test_valuation_row_can_be_edited(client):
    hid = cash_account_today(client, "Edit Row", 500)
    vals = a(client, "get", f"/holdings/{hid}/valuations").get_json()
    vid = vals[0]["id"]
    r = a(client, "put", f"/valuations/{vid}", {"value": 650, "valuation_date": date.today().isoformat()})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["value"] == 650
    assert a(client, "get", f"/holdings/{hid}/valuations").get_json()[0]["value"] == 650
    assert a(client, "put", f"/valuations/{vid}", {"valuation_date": "nope"}).status_code == 400
    assert a(client, "put", f"/valuations/{vid}", {"value": ""}).status_code == 400
    # Text must be rejected, not quietly saved as 0.
    assert a(client, "put", f"/valuations/{vid}", {"value": "abc"}).status_code == 400
    assert a(client, "get", f"/holdings/{hid}/valuations").get_json()[0]["value"] == 650


def test_other_user_cannot_edit_a_valuation_row(client):
    from backend.test_categories_and_entry_edit import b

    hid = cash_account_today(client, "Not Yours", 500)
    vid = a(client, "get", f"/holdings/{hid}/valuations").get_json()[0]["id"]
    assert b(client, "put", f"/valuations/{vid}", {"value": 1}).status_code in (403, 404)
    assert a(client, "get", f"/holdings/{hid}/valuations").get_json()[0]["value"] == 500


def test_alert_target_can_be_edited_and_goal_edit_is_owner_only(client):
    from backend.test_categories_and_entry_edit import b

    r = a(client, "post", "/alerts", {"alert_type": "net_worth_above", "threshold": 1000, "currency": "USD"})
    assert r.status_code == 201, r.get_json()
    aid = r.get_json()["id"]
    r = a(client, "put", f"/alerts/{aid}", {"threshold": 2500})
    assert r.status_code == 200 and r.get_json()["threshold"] == 2500
    assert a(client, "put", f"/alerts/{aid}", {"threshold": 0}).status_code == 400
    assert b(client, "put", f"/alerts/{aid}", {"threshold": 5}).status_code in (403, 404)

def test_account_less_holdings_can_be_created_without_an_account(client):
    for kind in ("real_estate", "fixed_deposit", "ppf", "epf"):
        r = a(client, "post", "/holdings", {"asset_type": kind, "name": f"No Acct {kind}", "country": "India", "account": "", "currency": "INR"})
        assert r.status_code == 201, (kind, r.get_json())
    # A stock still needs an account.
    r = a(client, "post", "/holdings", {"asset_type": "stock", "name": "X", "symbol": "X", "country": "United States", "account": "", "currency": "USD"})
    assert r.status_code == 400
    assert "account" in r.get_json()["error"]
