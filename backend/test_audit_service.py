import re
from pathlib import Path

import pytest

from backend import audit_service


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("203.0.113.77", "203.0.113.0"),
        ("10.1.2.3", "10.1.2.0"),
        ("2001:db8:abcd:1234:5678::1", "2001:db8:abcd::"),
        (None, None),
        ("", None),
        ("not-an-ip", None),
    ],
)
def test_addresses_are_stored_coarsely(raw, expected):
    assert audit_service.coarse_ip(raw) == expected


def test_every_event_type_used_in_a_route_has_a_label():
    used = set()
    for path in Path(__file__).parent.glob("routes/*.py"):
        used |= set(re.findall(r'record\(\s*"([a-z_.]+)"', path.read_text()))
    assert used, "expected routes to record events"
    assert used <= set(audit_service.EVENT_LABELS), used - set(audit_service.EVENT_LABELS)


def test_recording_an_unknown_event_never_raises(monkeypatch):
    monkeypatch.setattr(audit_service.db.session, "rollback", lambda: None)
    audit_service.record("not.a.real.event", user_id="u1")
