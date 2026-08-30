import os
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")

from backend import household_service, models

# Models that carry a household_id but are deliberately NOT unshared by
# delete_household -- they're membership/invite records specific to this
# household, not financial data, so they get deleted outright instead
# (see the two HouseholdInvite/HouseholdMember .delete() calls right after
# the unshare loop in household_service.delete_household).
MEMBERSHIP_MODEL_NAMES = {"HouseholdMember", "HouseholdInvite"}

UNSHARE_MODEL_NAMES = (
    "Holding", "NetWorthSnapshot", "BudgetEntry", "BudgetLimit", "BudgetCategory", "Account", "Liability", "Milestone",
)


def test_delete_household_unshares_every_household_scoped_model():
    """Regression test, twice over now: delete_household previously only
    unshared Holding, NetWorthSnapshot, BudgetEntry, and Milestone --
    Liability and BudgetLimit both also carry a household_id FK (added in
    later migrations) but were missed when the unshare loop was written,
    so deleting a household with a shared liability or spending limit
    still attached raised a raw ForeignKeyViolation (500) instead of the
    documented "everyone's data gets unshared" behavior. Verified live
    against the real DB before that fix.

    BudgetCategory (added later still, for user-defined budget categories)
    was missed the exact same way when it shipped, despite this test
    existing specifically to catch it -- the model list here has to be
    updated by hand alongside household_service.py's loop, and it wasn't.
    Re-verified live against the real DB: deleting a household with a
    custom category shared into it raised the identical ForeignKeyViolation
    until BudgetCategory was added to both the loop and this list.

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


def test_unshare_model_list_covers_every_household_scoped_model():
    """This is the test that should have caught the BudgetCategory gap
    above by itself, if it had existed at the time -- it doesn't rely on a
    human remembering to keep two hand-written lists (this one and
    household_service.delete_household's loop) in sync. Instead it
    introspects every actual mapped model for a household_id column and
    asserts delete_household's loop covers all of them (other than the
    membership/invite ones, which are deleted rather than unshared). Add a
    new household_id-bearing model without adding it to the unshare loop,
    and this fails immediately instead of only failing live in production
    the first time someone deletes a household with that data attached."""
    household_scoped_models = {
        mapper.class_.__name__ for mapper in models.db.Model.registry.mappers if hasattr(mapper.class_, "household_id")
    }
    expected_unshared = household_scoped_models - MEMBERSHIP_MODEL_NAMES
    assert expected_unshared == set(UNSHARE_MODEL_NAMES)
