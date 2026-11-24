"""The per-holding numbers are reused briefly, and any committed change makes them fresh again."""
from types import SimpleNamespace

from backend import holdings_service as hs


def _holdings(*ids):
    return [SimpleNamespace(id=i) for i in ids]


def test_second_call_reuses_the_result_and_commit_refreshes_it(monkeypatch):
    calls = []

    def fake(holdings, display_currency="USD"):
        calls.append(1)
        return [{"id": h.id, "display_value": 10.0 * len(calls)} for h in holdings]

    monkeypatch.setattr(hs, "_list_holdings_with_metrics_uncached", fake)
    hs._bump_data_version()
    a = hs.list_holdings_with_metrics(_holdings(1, 2))
    b = hs.list_holdings_with_metrics(_holdings(2, 1))
    assert len(calls) == 1
    assert [r["id"] for r in b] == [2, 1]
    b[0]["display_value"] = -1  # callers may change their copy
    assert hs.list_holdings_with_metrics(_holdings(1, 2)) == a
    hs._bump_data_version()  # what a database commit does
    hs.list_holdings_with_metrics(_holdings(1, 2))
    assert len(calls) == 2


def test_different_holdings_or_currency_are_not_mixed_up(monkeypatch):
    monkeypatch.setattr(
        hs, "_list_holdings_with_metrics_uncached", lambda hs_, display_currency="USD": [{"id": h.id, "cur": display_currency} for h in hs_]
    )
    hs._bump_data_version()
    assert hs.list_holdings_with_metrics(_holdings(1), "USD")[0]["cur"] == "USD"
    assert hs.list_holdings_with_metrics(_holdings(1), "INR")[0]["cur"] == "INR"
    assert [r["id"] for r in hs.list_holdings_with_metrics(_holdings(3))] == [3]
