"""The net-worth history endpoints must load (a bad relative import once made them crash), against a REAL Postgres."""
import pytest

from backend import test_tenant_isolation as tenant
from backend.test_categories_and_entry_edit import a
from backend.test_tenant_isolation import DB_URL, _is_local

client = tenant.client

pytestmark = pytest.mark.skipif(
    not DB_URL or not _is_local(DB_URL),
    reason="set TENANT_TEST_DATABASE_URL to a local Postgres to run these tests",
)


def test_net_worth_history_loads(client):
    r = a(client, "get", "/net-worth-history")
    assert r.status_code == 200, r.get_json()
