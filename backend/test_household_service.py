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


def _patched_models(stack):
    """Same patching approach as the delete_household test above, reused
    for leave_household/remove_member: patch every household-scoped model
    name on the service module to a MagicMock and record which ones get
    an unshare update() call."""
    updated_model_names = []
    for name in UNSHARE_MODEL_NAMES:
        mock_model = MagicMock()
        mock_model.query.filter_by.return_value.update.side_effect = lambda _v, _n=name: updated_model_names.append(_n)
        stack.enter_context(patch.object(household_service, name, mock_model))
    return updated_model_names


def test_leave_household_unshares_the_leaving_members_records():
    """Previously only deleted the HouseholdMember row -- every holding,
    liability, budget entry, etc. that member had shared into the
    household kept its household_id, so it stayed visible (and, per the
    is_private write-path bug, editable/deletable) to everyone left in the
    household indefinitely, with no way for the person who left to reach
    it again. Should mirror delete_household's unshare loop, just scoped
    to one user_id instead of the whole household."""
    with ExitStack() as stack:
        stack.enter_context(patch.object(household_service, "db"))
        updated_model_names = _patched_models(stack)

        mock_household = MagicMock()
        mock_household.query.get.return_value = MagicMock(owner_id="owner-1")
        stack.enter_context(patch.object(household_service, "Household", mock_household))

        mock_member = MagicMock()
        stack.enter_context(patch.object(household_service, "HouseholdMember", mock_member))

        household_service.leave_household("hh-1", user_id="member-2")

    assert set(updated_model_names) == set(UNSHARE_MODEL_NAMES)
    mock_member.query.filter_by.assert_called_with(household_id="hh-1", user_id="member-2")


def test_remove_member_unshares_the_removed_members_records():
    """Same bug, same fix, for the owner-initiated removal path."""
    with ExitStack() as stack:
        stack.enter_context(patch.object(household_service, "db"))
        updated_model_names = _patched_models(stack)

        mock_household = MagicMock()
        mock_household.query.get.return_value = MagicMock(owner_id="owner-1")
        stack.enter_context(patch.object(household_service, "Household", mock_household))

        mock_member = MagicMock()
        stack.enter_context(patch.object(household_service, "HouseholdMember", mock_member))

        household_service.remove_member("hh-1", requester_id="owner-1", target_user_id="member-2")

    assert set(updated_model_names) == set(UNSHARE_MODEL_NAMES)
    mock_member.query.filter_by.assert_called_with(household_id="hh-1", user_id="member-2")


def test_accept_invite_does_not_overwrite_an_existing_members_role():
    """A regression for a self-demotion bug: any editor could invite the
    household owner's own email with role='viewer' (create_invite has no
    check that the invitee isn't already a member), and accept_invite used
    db.session.merge() -- an upsert on HouseholdMember's composite PK
    (household_id, user_id) -- so the owner accepting that invite silently
    overwrote their own 'owner' role with 'viewer'. Accepting an invite
    while already a member must close out the invite without touching the
    existing membership row."""
    with ExitStack() as stack:
        mock_db = stack.enter_context(patch.object(household_service, "db"))

        invite = MagicMock(status="pending", invited_email="owner@example.com", household_id="hh-1", role="viewer")
        mock_invite_model = MagicMock()
        mock_invite_model.query.get.return_value = invite
        stack.enter_context(patch.object(household_service, "HouseholdInvite", mock_invite_model))

        existing_member = MagicMock(role="owner")
        mock_member_model = MagicMock()
        mock_member_model.query.filter_by.return_value.first.return_value = existing_member
        stack.enter_context(patch.object(household_service, "HouseholdMember", mock_member_model))

        household_service.accept_invite("invite-1", user_id="owner-1", user_email="owner@example.com")

        # The invite is still marked accepted (closes out the stale invite)...
        assert invite.status == "accepted"
        # ...but the existing row is never added OR merged over -- merge()
        # is exactly the old bug: an upsert on HouseholdMember's composite
        # PK that would silently overwrite existing_member's role.
        mock_db.session.add.assert_not_called()
        mock_db.session.merge.assert_not_called()
        assert existing_member.role == "owner"


def test_accept_invite_adds_a_new_member_when_not_already_one():
    with ExitStack() as stack:
        mock_db = stack.enter_context(patch.object(household_service, "db"))

        invite = MagicMock(status="pending", invited_email="new@example.com", household_id="hh-1", role="editor")
        mock_invite_model = MagicMock()
        mock_invite_model.query.get.return_value = invite
        stack.enter_context(patch.object(household_service, "HouseholdInvite", mock_invite_model))

        mock_member_model = MagicMock()
        mock_member_model.query.filter_by.return_value.first.return_value = None
        stack.enter_context(patch.object(household_service, "HouseholdMember", mock_member_model))

        household_service.accept_invite("invite-1", user_id="new-1", user_email="new@example.com")

    assert invite.status == "accepted"
    mock_db.session.add.assert_called_once()
    mock_member_model.assert_called_once_with(household_id="hh-1", user_id="new-1", role="editor")
