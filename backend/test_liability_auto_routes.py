"""Automatic loan updates through the API, against a REAL Postgres (local-only guard)."""
from datetime import date, timedelta

import pytest

from backend import test_tenant_isolation as tenant
from backend.test_categories_and_entry_edit import a, b
from backend.test_tenant_isolation import DB_URL, _is_local

client = tenant.client

pytestmark = pytest.mark.skipif(
    not DB_URL or not _is_local(DB_URL),
    reason="set TENANT_TEST_DATABASE_URL to a local Postgres to run these tests",
)


def make(client, **extra):
    body = {"name": "Auto Loan", "liability_type": "mortgage", "current_balance": 200000, "interest_rate": 6,
            "remaining_months": 360, "auto_update": True, **extra}
    return a(client, "post", "/liabilities", body)


def test_emi_is_worked_out_when_payment_is_blank(client):
    r = make(client)
    assert r.status_code == 201, r.get_json()
    d = r.get_json()
    assert d["monthly_payment"] == 1199.10
    assert d["auto_update"] is True
    assert d["next_auto_date"] > date.today().isoformat()


def test_needs_rate_and_months(client):
    assert make(client, interest_rate=None).status_code == 400
    assert make(client, remaining_months=None).status_code == 400
    assert make(client, auto_update=False, remaining_months=None).status_code == 201


def test_schedule_endpoint(client):
    lid = make(client).get_json()["id"]
    s = a(client, "get", f"/liabilities/{lid}/schedule").get_json()
    assert len(s["rows"]) == 360
    assert s["rows"][0]["balance"] == 199800.90
    assert 231000 < s["total_interest"] < 232500


def test_listing_catches_up_overdue_months_once(client):
    lid = make(client, payment_due_date=(date.today() + timedelta(days=5)).isoformat()).get_json()["id"]
    # Pretend the first update date was two months ago.
    from backend.models import Liability, db
    with client.application.app_context():
        li = db.session.get(Liability, lid)
        li.next_auto_date = date.today() - timedelta(days=45)
        db.session.commit()
    first = [x for x in a(client, "get", "/liabilities").get_json() if x["id"] == lid][0]
    again = [x for x in a(client, "get", "/liabilities").get_json() if x["id"] == lid][0]
    assert first["current_balance"] == again["current_balance"] < 200000
    assert first["remaining_months"] in (358, 359)


def test_other_user_cannot_see_schedule(client):
    lid = make(client).get_json()["id"]
    assert b(client, "get", f"/liabilities/{lid}/schedule").status_code in (403, 404)


def test_job_endpoint_needs_secret(client):
    assert client.post("/internal/update-liabilities").status_code == 401
