"""
Category management and full entry editing, against a REAL Postgres (same local-only
guard as test_tenant_isolation.py). Covers renaming and moving categories (and what
follows them), deleting with "move entries to", and editing every field of an entry,
including the account balances an entry moved.
"""
import pytest

from backend import test_tenant_isolation as tenant
from backend.test_tenant_isolation import DB_URL, USER_B, _is_local, call

client = tenant.client  # the shared real-Postgres app fixture

pytestmark = pytest.mark.skipif(
    not DB_URL or not _is_local(DB_URL),
    reason="set TENANT_TEST_DATABASE_URL to a local Postgres to run these tests",
)


def a(client, method, path, body=None):
    return call(client, "token-a", method, path, body)


def b(client, method, path, body=None):
    return call(client, "token-b", method, path, body)


def make_category(client, name, parent=None, entry_type="expense"):
    body = {"entry_type": entry_type, "name": name, **({"parent": parent} if parent else {})}
    r = a(client, "post", "/budget/categories", body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def custom(client, entry_type="expense"):
    return {c["name"]: c for c in a(client, "get", "/budget/categories").get_json()["items"][entry_type]}


def entry(client, **fields):
    body = {"entry_type": "expense", "category": "food", "entry_date": "2026-01-05", "amount": 10, **fields}
    r = a(client, "post", "/budget/entries", body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def balance(client, holding_id):
    r = a(client, "get", f"/holdings/{holding_id}")
    assert r.status_code == 200, r.get_json()
    return r.get_json()["current_value"]


def liability_balance(client, liability_id):
    return next(row for row in a(client, "get", "/liabilities").get_json() if row["id"] == liability_id)["current_balance"]


def cash_account(client, name, amount):
    r = a(client, "post", "/holdings", {"asset_type": "cash", "name": name, "country": "United States", "account": "Bank", "currency": "USD"})
    assert r.status_code == 201, r.get_json()
    hid = r.get_json()["id"]
    r = a(client, "post", f"/holdings/{hid}/valuations", {"valuation_date": "2026-01-01", "value": amount})
    assert r.status_code == 201, r.get_json()
    return hid


# ---- categories ----


def test_renaming_a_category_carries_its_entries_limit_and_subcategories(client):
    pets = make_category(client, "Pets")
    make_category(client, "Vet", parent="Pets")
    entry(client, category="Pets", amount=20)
    entry(client, category="Vet", amount=5)
    assert a(client, "post", "/budget/limits", {"category": "Pets", "monthly_limit": 60}).status_code == 201

    r = a(client, "put", f"/budget/categories/{pets['id']}", {"name": "Pet care"})
    assert r.status_code == 200 and r.get_json()["name"] == "Pet care"

    names = custom(client)
    assert "Pets" not in names and "Pet care" in names
    assert names["Vet"]["parent"] == "Pet care"
    categories_used = {e["category"] for e in a(client, "get", "/budget/entries").get_json()}
    assert "Pet care" in categories_used and "Pets" not in categories_used
    limits = {row["category"] for row in a(client, "get", "/budget/limits").get_json()}
    assert "Pet care" in limits and "Pets" not in limits


def test_rename_rules(client):
    cat = make_category(client, "Hobbies")
    other = make_category(client, "Crafts")
    for bad in ("food", "FOOD", "crafts", "", "x" * 33):
        r = a(client, "put", f"/budget/categories/{cat['id']}", {"name": bad})
        assert r.status_code == 400, bad
    # Same name with different capitals is the same category: allowed, it is a rename of itself.
    assert a(client, "put", f"/budget/categories/{cat['id']}", {"name": "hobbies"}).status_code == 200
    assert other["name"] in custom(client)


def test_names_longer_than_an_entry_can_store_are_refused(client):
    r = a(client, "post", "/budget/categories", {"entry_type": "expense", "name": "y" * 33})
    assert r.status_code == 400
    assert make_category(client, "z" * 32)["name"] == "z" * 32


def test_moving_a_category_under_another_or_back_to_the_top(client):
    cat = make_category(client, "Streaming")
    r = a(client, "put", f"/budget/categories/{cat['id']}", {"parent": "entertainment"})
    assert r.status_code == 200 and r.get_json()["parent"] == "entertainment"
    assert a(client, "get", "/budget/categories").get_json()["parents"]["expense"]["Streaming"] == "entertainment"
    r = a(client, "put", f"/budget/categories/{cat['id']}", {"parent": None})
    assert r.status_code == 200 and r.get_json()["parent"] is None


def test_nesting_rules_when_moving(client):
    parent = make_category(client, "Travel")
    child = make_category(client, "Flights", parent="Travel")
    # one level only: cannot go under a child, and a parent cannot become a child
    assert a(client, "put", f"/budget/categories/{make_category(client, 'Hotels')['id']}", {"parent": "Flights"}).status_code == 400
    assert a(client, "put", f"/budget/categories/{parent['id']}", {"parent": "shopping"}).status_code == 400
    assert a(client, "put", f"/budget/categories/{child['id']}", {"parent": "Flights"}).status_code == 400
    assert a(client, "put", f"/budget/categories/{child['id']}", {"parent": "nope"}).status_code == 400


def test_deleting_with_move_sends_entries_and_limit_to_the_other_category(client):
    old = make_category(client, "Gadgets")
    make_category(client, "Tech")
    entry(client, category="Gadgets", amount=7)
    assert a(client, "post", "/budget/limits", {"category": "Gadgets", "monthly_limit": 30}).status_code == 201

    assert a(client, "delete", f"/budget/categories/{old['id']}?move_to=Gadgets").status_code == 400
    assert a(client, "delete", f"/budget/categories/{old['id']}?move_to=nope").status_code == 400
    assert "Gadgets" in custom(client)

    assert a(client, "delete", f"/budget/categories/{old['id']}?move_to=Tech").status_code == 200
    assert "Gadgets" not in custom(client)
    assert {e["category"] for e in a(client, "get", "/budget/entries").get_json()} >= {"Tech"}
    assert "Gadgets" not in {e["category"] for e in a(client, "get", "/budget/entries").get_json()}
    assert "Tech" in {row["category"] for row in a(client, "get", "/budget/limits").get_json()}


def test_deleting_without_move_keeps_entries_and_frees_subcategories(client):
    parent = make_category(client, "Garden")
    make_category(client, "Seeds", parent="Garden")
    entry(client, category="Garden", amount=3)
    assert a(client, "delete", f"/budget/categories/{parent['id']}").status_code == 200
    assert custom(client)["Seeds"]["parent"] is None
    assert "Garden" in {e["category"] for e in a(client, "get", "/budget/entries").get_json()}


def test_someone_else_cannot_rename_or_delete_my_category(client):
    cat = make_category(client, "Mine only")
    assert b(client, "put", f"/budget/categories/{cat['id']}", {"name": "Taken"}).status_code in (403, 404)
    assert b(client, "delete", f"/budget/categories/{cat['id']}").status_code in (403, 404)
    assert "Mine only" in custom(client)


# ---- built-in categories are ordinary rows ----


def test_a_new_account_starts_with_the_defaults_as_editable_rows(client):
    items = a(client, "get", "/budget/categories").get_json()["items"]
    expense = {c["name"]: c for c in items["expense"]}
    income = {c["name"]: c for c in items["income"]}
    assert "food" in expense and "paycheck" in income
    assert all(c["id"] for c in items["expense"] + items["income"])
    # asking again does not add them a second time
    again = a(client, "get", "/budget/categories").get_json()["items"]
    assert [c["name"] for c in again["expense"]].count("food") == 1


def test_a_default_can_be_renamed_and_its_entries_and_limit_follow(client):
    food = custom(client)["food"]
    entry(client, category="food", amount=9)
    assert a(client, "post", "/budget/limits", {"category": "food", "monthly_limit": 100}).status_code == 201
    r = a(client, "put", f"/budget/categories/{food['id']}", {"name": "Groceries"})
    assert r.status_code == 200
    assert "food" not in custom(client) and "Groceries" in custom(client)
    assert "Groceries" in {e["category"] for e in a(client, "get", "/budget/entries").get_json()}
    assert "Groceries" in {row["category"] for row in a(client, "get", "/budget/limits").get_json()}
    # a name that was freed can be used again, and entries can use the new name
    assert entry(client, category="Groceries", amount=1)["category"] == "Groceries"


def test_a_default_can_be_removed_with_its_entries_moved(client):
    shopping = custom(client)["shopping"]
    make_category(client, "Everything else")
    entry(client, category="shopping", amount=4)
    r = a(client, "delete", f"/budget/categories/{shopping['id']}?move_to=Everything else")
    assert r.status_code == 200
    assert "shopping" not in custom(client)
    assert "shopping" not in {e["category"] for e in a(client, "get", "/budget/entries").get_json()}
    # removed means gone for good: it does not come back by itself
    assert "shopping" not in custom(client)
    # and new entries can no longer use it
    bad = a(client, "post", "/budget/entries", {"entry_type": "expense", "category": "shopping", "entry_date": "2026-01-05", "amount": 1})
    assert bad.status_code == 400


def test_restore_defaults_adds_back_only_what_is_missing(client):
    target = custom(client)["transport"]
    assert a(client, "delete", f"/budget/categories/{target['id']}").status_code == 200
    assert "transport" not in custom(client)
    r = a(client, "post", "/budget/categories/restore-defaults", {"entry_type": "expense"})
    assert r.status_code == 200 and "transport" in r.get_json()["added"]
    assert "transport" in custom(client)
    again = a(client, "post", "/budget/categories/restore-defaults", {"entry_type": "expense"})
    assert again.get_json()["added"] == []
    assert a(client, "post", "/budget/categories/restore-defaults", {"entry_type": "nope"}).status_code == 400


def test_one_persons_changes_to_defaults_never_touch_another_person(client):
    mine = custom(client)["housing"]
    assert a(client, "put", f"/budget/categories/{mine['id']}", {"name": "Rent and bills"}).status_code == 200
    theirs = {c["name"] for c in b(client, "get", "/budget/categories").get_json()["items"]["expense"]}
    assert "housing" in theirs and "Rent and bills" not in theirs
    assert b(client, "put", f"/budget/categories/{mine['id']}", {"name": "Taken"}).status_code in (403, 404)
    assert b(client, "delete", f"/budget/categories/{mine['id']}").status_code in (403, 404)


def test_removing_every_category_is_allowed_and_leaves_a_clean_empty_list(client):
    for c in list(custom(client).values()):
        assert a(client, "delete", f"/budget/categories/{c['id']}").status_code == 200
    body = a(client, "get", "/budget/categories").get_json()
    assert body["expense"] == [] and body["items"]["expense"] == []
    assert a(client, "post", "/budget/entries", {"entry_type": "expense", "category": "food", "entry_date": "2026-01-05", "amount": 1}).status_code == 400
    assert a(client, "post", "/budget/categories/restore-defaults", {"entry_type": "expense"}).status_code == 200
    assert "food" in custom(client)


# ---- editing an entry ----


def test_every_plain_field_of_an_entry_can_change(client):
    made = entry(client, description="Lunch", amount=12.5)
    r = a(client, "put", f"/budget/entries/{made['id']}", {
        "entry_date": "2026-01-09", "amount": 20, "currency": "INR", "category": "transport",
        "description": "Bus pass", "is_private": True, "is_recurring": True, "recurring_frequency": "monthly",
    })
    assert r.status_code == 200, r.get_json()
    e = r.get_json()
    assert (e["entry_date"], e["amount"], e["currency"], e["category"], e["description"]) == ("2026-01-09", 20, "INR", "transport", "Bus pass")
    assert e["is_private"] and e["is_recurring"] and e["recurring_frequency"] == "monthly"

    r = a(client, "put", f"/budget/entries/{made['id']}", {"is_recurring": False, "description": ""})
    assert r.get_json()["recurring_frequency"] is None and r.get_json()["description"] is None


def test_bad_edits_are_refused_and_change_nothing(client):
    made = entry(client, amount=9)
    for bad in ({"amount": 0}, {"amount": -4}, {"entry_date": "nonsense"}, {"category": "nope"}, {"recurring_frequency": "daily"}, {"entry_type": "other"}):
        assert a(client, "put", f"/budget/entries/{made['id']}", bad).status_code == 400, bad
    e = next(x for x in a(client, "get", "/budget/entries").get_json() if x["id"] == made["id"])
    assert e["amount"] == 9 and e["category"] == "food"


def test_changing_an_entry_from_expense_to_income(client):
    made = entry(client, amount=30, category="food")
    assert a(client, "put", f"/budget/entries/{made['id']}", {"entry_type": "income"}).status_code == 400  # needs an income category
    assert a(client, "put", f"/budget/entries/{made['id']}", {"entry_type": "income", "category": "food"}).status_code == 400
    r = a(client, "put", f"/budget/entries/{made['id']}", {"entry_type": "income", "category": "gift"})
    assert r.status_code == 200 and r.get_json()["entry_type"] == "income" and r.get_json()["category"] == "gift"


def test_editing_the_amount_moves_the_cash_account_by_the_difference(client):
    cash = cash_account(client, "Edit cash", 1000)
    made = entry(client, amount=100, funding_source_holding_id=cash)
    assert balance(client, cash) == 900
    assert a(client, "put", f"/budget/entries/{made['id']}", {"amount": 150}).status_code == 200
    assert balance(client, cash) == 850
    assert a(client, "put", f"/budget/entries/{made['id']}", {"amount": 40}).status_code == 200
    assert balance(client, cash) == 960


def test_changing_where_an_expense_was_paid_from_puts_money_back_and_takes_it_again(client):
    first = cash_account(client, "Pay from one", 1000)
    second = cash_account(client, "Pay from two", 500)
    made = entry(client, amount=100, funding_source_holding_id=first)
    assert balance(client, first) == 900

    r = a(client, "put", f"/budget/entries/{made['id']}", {"funding_source_holding_id": second})
    assert r.status_code == 200, r.get_json()
    assert balance(client, first) == 1000 and balance(client, second) == 400
    assert r.get_json()["funding_holding_id"] == second

    r = a(client, "put", f"/budget/entries/{made['id']}", {"funding_source_holding_id": None})
    assert r.status_code == 200
    assert balance(client, second) == 500 and r.get_json()["funding_holding_id"] is None


def test_changing_the_card_an_expense_was_charged_to(client):
    r = a(client, "post", "/liabilities", {"liability_type": "credit_card", "name": "Card one", "current_balance": 0})
    one = r.get_json()["id"]
    r = a(client, "post", "/liabilities", {"liability_type": "credit_card", "name": "Card two", "current_balance": 10})
    two = r.get_json()["id"]
    made = entry(client, amount=40, charge_liability_id=one)
    assert liability_balance(client, one) == 40

    assert a(client, "put", f"/budget/entries/{made['id']}", {"amount": 60}).status_code == 200
    assert liability_balance(client, one) == 60

    assert a(client, "put", f"/budget/entries/{made['id']}", {"charge_liability_id": two}).status_code == 200
    assert liability_balance(client, one) == 0 and liability_balance(client, two) == 70


def test_a_mortgage_cannot_be_charged_and_one_place_to_pay_from_only(client):
    cash = cash_account(client, "Combo cash", 300)
    r = a(client, "post", "/liabilities", {"liability_type": "credit_card", "name": "Combo card", "current_balance": 0})
    card = r.get_json()["id"]
    r = a(client, "post", "/liabilities", {"liability_type": "mortgage", "name": "Combo mortgage", "current_balance": 900})
    mortgage = r.get_json()["id"]
    made = entry(client, amount=10)
    assert a(client, "put", f"/budget/entries/{made['id']}", {"charge_liability_id": mortgage}).status_code == 400
    assert a(client, "put", f"/budget/entries/{made['id']}", {"charge_liability_id": card, "funding_source_holding_id": cash}).status_code == 400
    assert balance(client, cash) == 300 and liability_balance(client, card) == 0


def test_turning_an_expense_into_income_gives_back_what_it_took(client):
    cash = cash_account(client, "Flip cash", 1000)
    made = entry(client, amount=100, funding_source_holding_id=cash)
    assert balance(client, cash) == 900
    r = a(client, "put", f"/budget/entries/{made['id']}", {"entry_type": "income", "category": "gift"})
    assert r.status_code == 200, r.get_json()
    assert balance(client, cash) == 1000
    assert r.get_json()["funding_holding_id"] is None


def test_income_deposit_target_follows_amount_and_can_change(client):
    cash = cash_account(client, "Deposit cash", 200)
    other = cash_account(client, "Deposit other", 50)
    made = entry(client, entry_type="income", category="paycheck", amount=100, deposit_target_holding_id=cash)
    assert balance(client, cash) == 300
    assert a(client, "put", f"/budget/entries/{made['id']}", {"amount": 160}).status_code == 200
    assert balance(client, cash) == 360
    assert a(client, "put", f"/budget/entries/{made['id']}", {"deposit_target_holding_id": other}).status_code == 200
    assert balance(client, cash) == 200 and balance(client, other) == 210


def test_someone_else_cannot_point_my_entry_at_their_account(client):
    mine = cash_account(client, "Mine cash", 100)
    made = entry(client, amount=5)
    r = b(client, "post", "/holdings", {"asset_type": "cash", "name": "B cash", "country": "United States", "account": "B", "currency": "USD"})
    theirs = r.get_json()["id"]
    b(client, "post", f"/holdings/{theirs}/valuations", {"valuation_date": "2026-01-01", "value": 100})
    r = a(client, "put", f"/budget/entries/{made['id']}", {"funding_source_holding_id": theirs})
    assert r.status_code in (403, 404)
    assert balance(client, mine) == 100
    assert USER_B  # imported for the cross-user checks above
