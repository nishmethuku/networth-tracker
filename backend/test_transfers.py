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


def test_cannot_sell_more_than_is_held(client):
    hid = a(client, "post", "/holdings", {"asset_type": "stock", "symbol": "MSFT", "name": "Oversell", "country": "United States", "account": "Broker", "currency": "USD"}).get_json()["id"]
    buy = {"transaction_type": "buy", "transaction_date": "2025-01-02", "quantity": 10, "price_per_unit": 100, "currency": "USD"}
    assert a(client, "post", f"/holdings/{hid}/transactions", buy).status_code == 201
    sell = {**buy, "transaction_type": "sell", "transaction_date": "2025-06-02", "quantity": 999}
    assert a(client, "post", f"/holdings/{hid}/transactions", sell).status_code == 400
    ok = a(client, "post", f"/holdings/{hid}/transactions", {**sell, "quantity": 4})
    assert ok.status_code == 201
    tid = ok.get_json()["id"]
    assert a(client, "put", f"/transactions/{tid}", {"quantity": 999}).status_code == 400
    assert a(client, "put", f"/transactions/{tid}", {"quantity": 10}).status_code == 200
    assert a(client, "get", f"/holdings/{hid}").get_json()["quantity"] == 0


def test_cannot_move_or_pay_more_than_the_account_holds(client):
    src, dst = cash_account_today(client, "Small Checking", 100), cash_account_today(client, "Other Savings", 50)
    too_much = move(client, src, dst, 500)
    assert too_much.status_code == 400
    assert "Not enough" in too_much.get_json()["error"]
    assert balance(client, src) == 100 and balance(client, dst) == 50
    assert move(client, src, dst, 100).status_code == 201
    card = a(client, "post", "/liabilities", {"name": "Small Visa", "liability_type": "credit_card", "currency": "USD", "current_balance": 400}).get_json()["id"]
    assert a(client, "post", f"/liabilities/{card}/payments", {"amount": 300, "funding_source_holding_id": src}).status_code == 400
    assert a(client, "post", f"/liabilities/{card}/payments", {"amount": 30, "funding_source_holding_id": dst}).status_code == 201


def test_transfer_can_be_cleared_after_one_of_its_accounts_is_deleted(client):
    src, dst = cash_account_today(client, "Gone Checking", 300), cash_account_today(client, "Gone Savings", 20)
    tid = move(client, src, dst, 100).get_json()["transfer"]["id"]
    assert a(client, "delete", f"/holdings/{src}").status_code == 200
    r = a(client, "delete", f"/transfers/{tid}")
    assert r.status_code == 200, r.get_json()
    assert all(t["id"] != tid for t in a(client, "get", "/transfers").get_json())
    assert balance(client, dst) == 120


def test_deleted_holding_can_be_restored_with_its_purchases(client):
    from backend.test_categories_and_entry_edit import b

    hid = a(client, "post", "/holdings", {"asset_type": "stock", "symbol": "MSFT", "name": "Restore Me", "country": "United States", "account": "Broker", "currency": "USD"}).get_json()["id"]
    keep = {"transaction_type": "buy", "transaction_date": "2025-01-02", "quantity": 10, "price_per_unit": 100, "currency": "USD"}
    first = a(client, "post", f"/holdings/{hid}/transactions", keep).get_json()["id"]
    second = a(client, "post", f"/holdings/{hid}/transactions", {**keep, "quantity": 5}).get_json()["id"]
    assert a(client, "delete", f"/transactions/{second}").status_code == 200  # removed on its own earlier
    assert a(client, "delete", f"/holdings/{hid}").status_code == 200
    assert a(client, "get", f"/holdings/{hid}").status_code == 404

    deleted = a(client, "get", "/holdings/deleted").get_json()
    assert hid in [d["id"] for d in deleted]
    assert b(client, "post", f"/holdings/{hid}/restore").status_code in (403, 404)

    assert a(client, "post", f"/holdings/{hid}/restore").status_code == 200
    back = a(client, "get", f"/holdings/{hid}").get_json()
    assert back["quantity"] == 10  # the earlier-deleted purchase stays deleted
    assert hid not in [d["id"] for d in a(client, "get", "/holdings/deleted").get_json()]
    assert a(client, "post", f"/holdings/{hid}/restore").status_code == 400
    assert first


def test_holding_can_be_removed_for_good_only_after_it_was_deleted(client):
    from backend.test_categories_and_entry_edit import b

    hid = a(client, "post", "/holdings", {"asset_type": "cash", "name": "Forever", "country": "United States", "account": "Bank", "currency": "USD"}).get_json()["id"]
    a(client, "post", f"/holdings/{hid}/valuations", {"valuation_date": date.today().isoformat(), "value": 10})
    assert a(client, "delete", f"/holdings/{hid}/permanent").status_code == 400  # not deleted yet
    assert a(client, "delete", f"/holdings/{hid}").status_code == 200
    assert b(client, "delete", f"/holdings/{hid}/permanent").status_code in (403, 404)
    assert a(client, "delete", f"/holdings/{hid}/permanent").status_code == 200
    assert hid not in [d["id"] for d in a(client, "get", "/holdings/deleted").get_json()]
    assert a(client, "post", f"/holdings/{hid}/restore").status_code == 404


def test_test_email_says_plainly_when_email_is_not_set_up(client, monkeypatch):
    from backend import email_service

    monkeypatch.setattr(email_service, "RESEND_API_KEY", None)
    r = a(client, "post", "/alerts/test-email", {})
    assert r.status_code == 400
    assert "not set up" in r.get_json()["error"]


def test_test_email_sends_when_configured(client, monkeypatch):
    from backend import alert_service, email_service

    monkeypatch.setattr(email_service, "RESEND_API_KEY", "key")
    monkeypatch.setattr(alert_service, "_user_email", lambda uid: "me@example.com")
    sent = []
    monkeypatch.setattr(email_service, "send", lambda to, subject, html, attachments=None: sent.append(to) or True)
    r = a(client, "post", "/alerts/test-email", {})
    assert r.status_code == 200, r.get_json()
    assert sent == ["me@example.com"]


def test_deleted_transaction_can_be_restored_but_not_into_an_oversell(client):
    h = a(client, "post", "/holdings", {"asset_type": "stock", "symbol": "UNDO1", "name": "UNDO1", "country": "United States", "account": "U", "currency": "USD"}).get_json()["id"]
    buy = {"transaction_type": "buy", "transaction_date": "2025-01-02", "quantity": 10, "price_per_unit": 100, "currency": "USD"}
    buy_id = a(client, "post", f"/holdings/{h}/transactions", buy).get_json()["id"]
    sell_id = a(client, "post", f"/holdings/{h}/transactions", {**buy, "transaction_type": "sell", "transaction_date": "2025-06-02", "quantity": 4}).get_json()["id"]
    # Delete the sale, then bring it back.
    assert a(client, "delete", f"/transactions/{sell_id}").status_code == 200
    assert a(client, "post", f"/transactions/{sell_id}/restore", {}).status_code == 200
    assert a(client, "post", f"/transactions/{sell_id}/restore", {}).status_code == 400  # already restored
    # Delete both; restoring the sale before the purchase would oversell.
    a(client, "delete", f"/transactions/{sell_id}")
    a(client, "delete", f"/transactions/{buy_id}")
    r = a(client, "post", f"/transactions/{sell_id}/restore", {})
    assert r.status_code == 400 and "more than you hold" in r.get_json()["error"]
    assert a(client, "post", f"/transactions/{buy_id}/restore", {}).status_code == 200
    assert a(client, "post", f"/transactions/{sell_id}/restore", {}).status_code == 200
