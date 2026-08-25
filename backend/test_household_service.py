from contextlib import ExitStack
from unittest.mock import MagicMock, patch

from backend import household_service

UNSHARE_MODEL_NAMES = ("Holding", "NetWorthSnapshot", "BudgetEntry", "BudgetLimit", "Liability", "Milestone")


def test_delete_household_unshares_every_household_scoped_model():
    """Regression test: delete_household previously only unshared Holding,
    NetWorthSnapshot, BudgetEntry, and Milestone -- Liability and
    BudgetLimit both also carry a household_id FK (added in later
    migrations) but were missed when the unshare loop was written, so
    deleting a household with a shared liability or spending limit still
    attached raised a raw ForeignKeyViolation (500) instead of the
    documented "everyone's data gets unshared" behavior. Verified live
    against the real DB before this fix.

    Patches every model name the service module imports (rather than
    hitting real SQLAlchemy query machinery, which needs a live app
    context) so this stays a fast, DB-free unit test."""
    household = MagicMock(owner_id="owner-1")
    updated_model_names = []

    with ExitStack() as stack:
        stack.enter_context(patch.object(household_service, "db"))

        mock_household = MagicMock()
        mock_household.query.get.return_value = household
        stack.enter_context(patch.object(household_service, "Household", mock_household))

        for name in UNSHARE_MODEL_NAMES:
            mock_model = MagicMock()
            mock_model.query.filter_by.return_value.update.side_effect = lambda _v, _n=name: updated_model_names.append(_n)
            stack.enter_context(patch.object(household_service, name, mock_model))

        stack.enter_context(patch.object(household_service, "HouseholdInvite", MagicMock()))
        stack.enter_context(patch.object(household_service, "HouseholdMember", MagicMock()))

        household_service.delete_household("hh-1", requester_id="owner-1")

    assert set(updated_model_names) == set(UNSHARE_MODEL_NAMES)
