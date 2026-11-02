"""Routes: budget. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os
from datetime import date

from flask import abort, g, jsonify, request
from werkzeug.exceptions import HTTPException

from .. import ai_service, price_service
from ..auth import require_auth
from ..budget_service import (
    category_exists,
    create_category,
    delete_category,
    delete_limit,
    get_limits,
    get_monthly_summary,
    get_subscriptions,
    get_year,
    list_categories,
    log_due_recurring,
    set_limit,
    update_category,
)
from ..holdings_service import (
    build_deposit_valuation,
    build_funding_valuation,
)
from ..household_service import (
    get_member_household_ids,
    get_role,
)
from ..liability_service import (
    CHARGEABLE_TYPES,
    adjust_for_edit,
    apply_charge,
    apply_payment,
    reverse_charge,
    reverse_payment,
)
from ..models import (
    BudgetCategory,
    BudgetEntry,
    BudgetLimit,
    HoldingValuation,
    db,
)
from ..services import safe_float

try:
    from ..utils import MFTOOL_AVAILABLE, get_mf_instance
except (ImportError, AttributeError):
    MFTOOL_AVAILABLE = False

    def get_mf_instance():
        return None

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")
DIGEST_SECRET = os.environ.get("DIGEST_SECRET") or SNAPSHOT_SECRET

logger = logging.getLogger("networth_tracker")


def register(app, h):
    get_authorized_holding = h.get_authorized_holding
    get_authorized_liability = h.get_authorized_liability
    limiter = app.extensions["limiter"]
    require_ai_access = h.require_ai_access
    validate_household_id_for_write = h.validate_household_id_for_write

    def scoped_budget_query(household_id_param):
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403, description="Not a member of this household")
            return BudgetEntry.query.filter(
                BudgetEntry.household_id == household_id_param, BudgetEntry.is_private == False  # noqa: E712
            )
        return BudgetEntry.query.filter(BudgetEntry.user_id == g.user_id)

    def get_authorized_budget_entry(entry_id, require_write=False):
        entry = BudgetEntry.query.get_or_404(entry_id)
        if str(entry.user_id) == str(g.user_id):
            return entry
        if entry.household_id:
            role = get_role(str(entry.household_id), g.user_id)
            if role and not entry.is_private:
                if require_write and role in ("owner", "editor"):
                    return entry
                if not require_write:
                    return entry
        abort(403)

    @app.route("/budget/categories", methods=["GET"])
    @require_auth
    def budget_categories():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        return jsonify(list_categories(g.user_id if not household_id_param else None, household_id_param))

    @app.route("/budget/categories", methods=["POST"])
    @require_auth
    def budget_categories_create():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        try:
            category = create_category(
                g.user_id, entry_type=data.get("entry_type"), name=data.get("name"), household_id=household_id, parent=data.get("parent")
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(category), 201

    def authorized_custom_category(category_id):
        """The category row, after checking the caller may change it."""
        category = BudgetCategory.query.get_or_404(category_id)
        if category.household_id:
            validate_household_id_for_write(str(category.household_id))
        elif str(category.user_id) != str(g.user_id):
            abort(403)
        return category

    @app.route("/budget/categories/<int:category_id>", methods=["PUT"])
    @require_auth
    def budget_categories_update(category_id):
        category = authorized_custom_category(category_id)
        data = request.get_json(force=True)
        changes = {}
        if "name" in data:
            changes["name"] = data["name"]
        if "parent" in data:
            changes["parent"] = data["parent"]
        try:
            updated = update_category(
                category_id, g.user_id, str(category.household_id) if category.household_id else None, **changes
            )
        except ValueError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 400
        return jsonify(updated)

    @app.route("/budget/categories/<int:category_id>", methods=["DELETE"])
    @require_auth
    def budget_categories_delete(category_id):
        category = authorized_custom_category(category_id)
        try:
            delete_category(
                category_id,
                g.user_id,
                str(category.household_id) if category.household_id else None,
                move_to=request.args.get("move_to"),
            )
        except ValueError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 400
        return jsonify({"message": "Category deleted"}), 200

    @app.route("/budget/entries", methods=["GET"])
    @require_auth
    def list_budget_entries():
        household_id_param = request.args.get("household_id")
        query = scoped_budget_query(household_id_param)

        entry_type = request.args.get("entry_type")
        if entry_type:
            query = query.filter(BudgetEntry.entry_type == entry_type)
        date_from = request.args.get("date_from")
        if date_from:
            query = query.filter(BudgetEntry.entry_date >= date.fromisoformat(date_from))
        date_to = request.args.get("date_to")
        if date_to:
            query = query.filter(BudgetEntry.entry_date <= date.fromisoformat(date_to))

        entries = query.order_by(BudgetEntry.entry_date.desc()).limit(500).all()
        return jsonify([e.to_dict() for e in entries])

    @app.route("/budget/entries", methods=["POST"])
    @require_auth
    def create_budget_entry():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        entry_type = data.get("entry_type")
        if entry_type not in ("income", "expense"):
            return jsonify({"error": "entry_type must be 'income' or 'expense'"}), 400
        category = data.get("category")
        if not category_exists(category, entry_type, g.user_id, household_id):
            return jsonify({"error": f"'{category}' isn't a known {entry_type} category"}), 400
        missing = [f for f in ("entry_date", "amount") if data.get(f) in (None, "")]
        if missing:
            return jsonify({"error": f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required"}), 400

        recurring_frequency = data.get("recurring_frequency")
        if recurring_frequency and recurring_frequency not in ("weekly", "monthly", "quarterly", "yearly"):
            return jsonify({"error": "recurring_frequency must be weekly, monthly, quarterly, or yearly"}), 400

        # Authorize the linked liability (if any) *before* constructing/
        # adding the entry — get_authorized_liability's lookup would
        # otherwise trigger SQLAlchemy's autoflush on an already-added
        # entry carrying a bad linked_liability_id, turning a clean 404
        # into a raw IntegrityError (foreign-key violation) and a 500.
        linked_liability_id = data.get("linked_liability_id") if entry_type == "expense" else None
        liability = get_authorized_liability(linked_liability_id, require_write=True) if linked_liability_id else None
        if liability and liability.liability_type in CHARGEABLE_TYPES:
            # The purchases on a card are already expenses; counting the bill as an
            # expense too would count the same money twice.
            return jsonify({"error": "Record credit card payments from the Liabilities page so they are not counted as spending twice"}), 400

        # A purchase "paid from" a credit card raises that card's balance.
        # Authorized up front for the same autoflush reason, and it can't be
        # combined with the other ways of paying for the same expense.
        charge_liability_id = data.get("charge_liability_id") if entry_type == "expense" else None
        charged_liability = None
        if charge_liability_id:
            if linked_liability_id or data.get("funding_source_holding_id"):
                return jsonify({"error": "Pick one place to pay from: a cash account or a credit card"}), 400
            charged_liability = get_authorized_liability(charge_liability_id, require_write=True)
            if charged_liability.liability_type not in CHARGEABLE_TYPES:
                return jsonify({"error": "Only a credit card or line of credit can be charged"}), 400

        # Same autoflush-safe ordering as linked_liability_id above:
        # authorize the deposit target *before* constructing/adding the
        # entry, so a bad id 404s cleanly instead of surfacing as a raw
        # IntegrityError when the next query autoflushes the session.
        deposit_target_id = data.get("deposit_target_holding_id") if entry_type == "income" else None
        deposit_target = get_authorized_holding(deposit_target_id, require_write=True) if deposit_target_id else None

        entry = BudgetEntry(
            user_id=g.user_id,
            household_id=household_id,
            entry_type=entry_type,
            entry_date=date.fromisoformat(data["entry_date"]),
            amount=safe_float(data["amount"]),
            currency=data.get("currency", "USD"),
            category=category,
            description=data.get("description"),
            is_private=bool(data.get("is_private", False)),
            is_recurring=bool(data.get("is_recurring", False)),
            recurring_frequency=recurring_frequency,
            linked_liability_id=linked_liability_id,
            charged_liability_id=charged_liability.id if charged_liability else None,
            deposit_target_holding_id=deposit_target_id,
        )
        db.session.add(entry)

        funding_valuation = None
        funding_source_id = data.get("funding_source_holding_id")
        if funding_source_id and entry_type == "expense":
            source_holding = get_authorized_holding(funding_source_id, require_write=True)
            source_valuations = HoldingValuation.query.filter_by(holding_id=source_holding.id).all()
            try:
                funding_valuation = build_funding_valuation(
                    source_holding, source_valuations, entry.amount, entry.currency, entry.entry_date, g.user_id
                )
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
            db.session.add(funding_valuation)
            entry.funding_holding_id = source_holding.id

        liability_after_payment = None
        if liability:
            liability_after_payment = apply_payment(liability, entry.amount, entry.currency)

        liability_after_charge = None
        if charged_liability:
            liability_after_charge = apply_charge(charged_liability, entry.amount, entry.currency)

        # A deposit target doesn't have to be a cash holding -- picking a
        # stock/other account here also tags the income entry with it
        # (deposit_target_holding_id, already set above) as a "this is
        # what this income was for" record even when there's no balance to
        # actually add to. Only cash holdings get the balance bump itself.
        deposit_valuation = None
        if deposit_target and deposit_target.asset_type == "cash":
            target_valuations = HoldingValuation.query.filter_by(holding_id=deposit_target.id).all()
            try:
                deposit_valuation = build_deposit_valuation(
                    deposit_target, target_valuations, entry.amount, entry.currency, entry.entry_date, g.user_id
                )
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
            db.session.add(deposit_valuation)

        db.session.commit()
        return jsonify({
            **entry.to_dict(),
            "funding_source": funding_valuation.to_dict() if funding_valuation else None,
            "linked_liability": liability_after_payment.to_dict() if liability_after_payment else None,
            "charged_liability": liability_after_charge.to_dict() if liability_after_charge else None,
            "deposit_target": deposit_valuation.to_dict() if deposit_valuation else None,
        }), 201

    def _id_or_none(value):
        if value in (None, "", 0, "0"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValueError("That account is not valid")

    def _put_back(entry, amount, currency, acting_user_id):
        """Undoes what the entry did to an account or card, using the amounts it had when it was logged."""
        done = {}
        if entry.entry_type == "expense":
            if entry.charged_liability_id:
                card = get_authorized_liability(entry.charged_liability_id, require_write=True)
                reverse_charge(card, amount, currency)
                done["charged_liability"] = card.to_dict()
            if entry.linked_liability_id:
                loan = get_authorized_liability(entry.linked_liability_id, require_write=True)
                reverse_payment(loan, amount, currency)
                done["linked_liability"] = loan.to_dict()
            if entry.funding_holding_id:
                source = get_authorized_holding(entry.funding_holding_id, require_write=True)
                valuations = HoldingValuation.query.filter_by(holding_id=source.id).all()
                refund = build_deposit_valuation(
                    source, valuations, amount, currency, date.today(), acting_user_id, notes="Put back after editing an expense"
                )
                db.session.add(refund)
                done["funding_source"] = refund.to_dict()
        elif entry.deposit_target_holding_id:
            target = get_authorized_holding(entry.deposit_target_holding_id, require_write=True)
            if target.asset_type == "cash":
                valuations = HoldingValuation.query.filter_by(holding_id=target.id).all()
                draw = build_funding_valuation(target, valuations, amount, currency, date.today(), acting_user_id)
                db.session.add(draw)
                done["deposit_target"] = draw.to_dict()
        entry.charged_liability_id = None
        entry.linked_liability_id = None
        entry.funding_holding_id = None
        entry.deposit_target_holding_id = None
        return done

    @app.route("/budget/entries/<int:entry_id>", methods=["PUT"])
    @require_auth
    def update_budget_entry(entry_id):
        entry = get_authorized_budget_entry(entry_id, require_write=True)
        data = request.get_json(force=True)
        old_amount, old_currency, old_type = entry.amount, entry.currency, entry.entry_type
        household = str(entry.household_id) if entry.household_id else None

        new_type = data.get("entry_type", old_type)
        if new_type not in ("income", "expense"):
            return jsonify({"error": "entry_type must be 'income' or 'expense'"}), 400
        type_changed = new_type != old_type

        new_category = data.get("category", entry.category)
        if ("category" in data or type_changed) and not category_exists(new_category, new_type, g.user_id, household):
            if type_changed and "category" not in data:
                return jsonify({"error": f"Pick a {new_type} category for this entry"}), 400
            return jsonify({"error": f"'{new_category}' isn't a known {new_type} category"}), 400

        if "recurring_frequency" in data and data["recurring_frequency"]:
            if data["recurring_frequency"] not in ("weekly", "monthly", "quarterly", "yearly"):
                return jsonify({"error": "recurring_frequency must be weekly, monthly, quarterly, or yearly"}), 400
        try:
            new_date = date.fromisoformat(data["entry_date"]) if "entry_date" in data else entry.entry_date
        except (TypeError, ValueError):
            return jsonify({"error": "entry_date must be a valid date (YYYY-MM-DD)"}), 400
        new_amount = safe_float(data["amount"]) if "amount" in data else old_amount
        if "amount" in data and not (new_amount and new_amount > 0):
            return jsonify({"error": "amount must be greater than zero"}), 400
        new_currency = data.get("currency", old_currency)

        # Which accounts the entry should touch afterwards. A key left out keeps what it had
        # (unless the entry changes type, which drops them).
        current = {
            "funding": entry.funding_holding_id,
            "charge": entry.charged_liability_id,
            "loan": entry.linked_liability_id,
            "deposit": entry.deposit_target_holding_id,
        }
        try:
            wanted = dict(current) if not type_changed else {k: None for k in current}
            if "funding_source_holding_id" in data:
                wanted["funding"] = _id_or_none(data["funding_source_holding_id"])
            if "charge_liability_id" in data:
                wanted["charge"] = _id_or_none(data["charge_liability_id"])
            if "linked_liability_id" in data:
                wanted["loan"] = _id_or_none(data["linked_liability_id"])
            if "deposit_target_holding_id" in data:
                wanted["deposit"] = _id_or_none(data["deposit_target_holding_id"])
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        if new_type == "expense":
            wanted["deposit"] = None
        else:
            wanted["funding"] = wanted["charge"] = wanted["loan"] = None
        links_changed = wanted != current

        if links_changed:
            if wanted["charge"] and (wanted["loan"] or wanted["funding"]):
                return jsonify({"error": "Pick one place to pay from: a cash account or a credit card"}), 400
            try:
                # Authorize everything first so a bad id answers cleanly before anything changes.
                new_loan = get_authorized_liability(wanted["loan"], require_write=True) if wanted["loan"] else None
                if new_loan and new_loan.liability_type in CHARGEABLE_TYPES:
                    return jsonify({"error": "Record credit card payments from the Liabilities page so they are not counted as spending twice"}), 400
                new_card = get_authorized_liability(wanted["charge"], require_write=True) if wanted["charge"] else None
                if new_card and new_card.liability_type not in CHARGEABLE_TYPES:
                    return jsonify({"error": "Only a credit card or line of credit can be charged"}), 400
                new_source = get_authorized_holding(wanted["funding"], require_write=True) if wanted["funding"] else None
                new_target = get_authorized_holding(wanted["deposit"], require_write=True) if wanted["deposit"] else None
            except HTTPException:
                db.session.rollback()
                return jsonify({"error": "You cannot use that account"}), 403

        adjusted = {}
        try:
            if links_changed:
                # Put back what the entry did with its old amount, then do the new thing with the new amount.
                adjusted.update({f"put_back_{k}": v for k, v in _put_back(entry, old_amount, old_currency, g.user_id).items()})
                entry.entry_type = new_type
                entry.amount = new_amount
                entry.currency = new_currency
                entry.entry_date = new_date
                if new_loan:
                    entry.linked_liability_id = new_loan.id
                    adjusted["linked_liability"] = apply_payment(new_loan, new_amount, new_currency).to_dict()
                if new_card:
                    entry.charged_liability_id = new_card.id
                    adjusted["charged_liability"] = apply_charge(new_card, new_amount, new_currency).to_dict()
                if new_source:
                    valuations = HoldingValuation.query.filter_by(holding_id=new_source.id).all()
                    valuation = build_funding_valuation(new_source, valuations, new_amount, new_currency, new_date, g.user_id)
                    db.session.add(valuation)
                    entry.funding_holding_id = new_source.id
                    adjusted["funding_source"] = valuation.to_dict()
                if new_target:
                    entry.deposit_target_holding_id = new_target.id
                    if new_target.asset_type == "cash":
                        valuations = HoldingValuation.query.filter_by(holding_id=new_target.id).all()
                        valuation = build_deposit_valuation(new_target, valuations, new_amount, new_currency, new_date, g.user_id)
                        db.session.add(valuation)
                        adjusted["deposit_target"] = valuation.to_dict()
            else:
                entry.entry_type = new_type
                entry.amount = new_amount
                entry.currency = new_currency
                entry.entry_date = new_date
                # Changing the amount or currency of an entry that moved a card, a loan or a
                # cash account moves that balance by the difference.
                if new_amount != old_amount or new_currency != old_currency:
                    if entry.charged_liability_id:
                        card = get_authorized_liability(entry.charged_liability_id, require_write=True)
                        adjust_for_edit(card, old_amount, old_currency, new_amount, new_currency, "charge")
                        adjusted["charged_liability"] = card.to_dict()
                    if entry.linked_liability_id:
                        loan = get_authorized_liability(entry.linked_liability_id, require_write=True)
                        adjust_for_edit(loan, old_amount, old_currency, new_amount, new_currency, "payment")
                        adjusted["linked_liability"] = loan.to_dict()
                    cash_id = entry.funding_holding_id or (
                        entry.deposit_target_holding_id if entry.entry_type == "income" else None
                    )
                    if cash_id:
                        source = get_authorized_holding(cash_id, require_write=True)
                        if entry.funding_holding_id or source.asset_type == "cash":
                            old_in_holding = price_service.convert(old_amount, old_currency, source.currency)
                            new_in_holding = price_service.convert(new_amount, new_currency, source.currency)
                            delta = new_in_holding - old_in_holding
                            if entry.entry_type == "income":
                                delta = -delta  # more income puts more money in
                            if abs(delta) > 0.004:
                                valuations = HoldingValuation.query.filter_by(holding_id=source.id).all()
                                builder = build_funding_valuation if delta > 0 else build_deposit_valuation
                                kwargs = {} if delta > 0 else {"notes": "Adjusted after editing an entry"}
                                valuation = builder(source, valuations, abs(delta), source.currency, date.today(), g.user_id, **kwargs)
                                db.session.add(valuation)
                                adjusted["funding_source" if entry.funding_holding_id else "deposit_target"] = valuation.to_dict()
        except HTTPException:
            db.session.rollback()
            return jsonify({"error": "You can no longer change the account this was paid from"}), 403
        except ValueError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 400

        entry.category = new_category
        if "description" in data:
            entry.description = data["description"] or None
        if "is_private" in data:
            entry.is_private = bool(data["is_private"])
        if "is_recurring" in data:
            entry.is_recurring = bool(data["is_recurring"])
        if "recurring_frequency" in data:
            entry.recurring_frequency = data["recurring_frequency"] or None
        if not entry.is_recurring:
            entry.recurring_frequency = None

        db.session.commit()
        return jsonify({**entry.to_dict(), **adjusted})

    @app.route("/budget/entries/<int:entry_id>", methods=["DELETE"])
    @require_auth
    def delete_budget_entry(entry_id):
        entry = get_authorized_budget_entry(entry_id, require_write=True)
        reversed_items = {}
        # With ?reverse=true, put back the money this expense moved: the card
        # balance it raised, the cash account it drew down, or the loan
        # payment it made. Anything the user can no longer write to is skipped.
        if request.args.get("reverse") == "true" and entry.entry_type == "expense":
            try:
                if entry.charged_liability_id:
                    card = get_authorized_liability(entry.charged_liability_id, require_write=True)
                    reverse_charge(card, entry.amount, entry.currency)
                    reversed_items["charged_liability"] = card.to_dict()
                if entry.linked_liability_id:
                    loan = get_authorized_liability(entry.linked_liability_id, require_write=True)
                    reverse_payment(loan, entry.amount, entry.currency)
                    reversed_items["linked_liability"] = loan.to_dict()
                if entry.funding_holding_id:
                    source = get_authorized_holding(entry.funding_holding_id, require_write=True)
                    valuations = HoldingValuation.query.filter_by(holding_id=source.id).all()
                    refund = build_deposit_valuation(
                        source, valuations, entry.amount, entry.currency, date.today(), g.user_id,
                        notes="Put back after deleting an expense",
                    )
                    db.session.add(refund)
                    reversed_items["funding_source"] = refund.to_dict()
            except HTTPException:
                db.session.rollback()
                return jsonify({"error": "You can no longer change the account this was paid from"}), 403
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"message": "Entry deleted", "reversed": reversed_items}), 200

    @app.route("/budget/summary", methods=["GET"])
    @require_auth
    def budget_summary():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        months = int(request.args.get("months", 6))
        currency = request.args.get("currency", "USD").upper()
        result = get_monthly_summary(
            g.user_id if not household_id_param else None, household_id_param, months=months, currency=currency
        )
        return jsonify(result)

    @app.route("/budget/subscriptions", methods=["GET"])
    @require_auth
    def budget_subscriptions():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        currency = request.args.get("currency", "USD").upper()
        result = get_subscriptions(
            g.user_id if not household_id_param else None, household_id_param, currency=currency
        )
        return jsonify(result)

    @app.route("/budget/year", methods=["GET"])
    @require_auth
    def budget_year():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        currency = request.args.get("currency", "USD").upper()
        try:
            year = int(request.args["year"]) if request.args.get("year") else None
        except ValueError:
            return jsonify({"error": "year must be a number"}), 400
        return jsonify(get_year(g.user_id if not household_id_param else None, household_id_param, year=year, currency=currency))

    @app.route("/budget/recurring/log-due", methods=["POST"])
    @require_auth
    def budget_log_due_recurring():
        """Logs the recurring bills that have come due since their last entry. Safe to call
        repeatedly (and from several devices): each run starts from the latest entry."""
        data = request.get_json(silent=True) or {}
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        created = log_due_recurring(g.user_id, household_id)
        return jsonify({"created": [e.to_dict() for e in created], "count": len(created)}), 201 if created else 200

    @app.route("/budget/limits", methods=["GET"])
    @require_auth
    def budget_limits_list():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        limits = get_limits(g.user_id if not household_id_param else None, household_id_param)
        return jsonify(limits)

    @app.route("/budget/limits", methods=["POST"])
    @require_auth
    def budget_limits_create():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        try:
            limit = set_limit(
                g.user_id,
                category=data.get("category"),
                monthly_limit=safe_float(data.get("monthly_limit")),
                currency=data.get("currency", "USD"),
                household_id=household_id,
                rollover=bool(data["rollover"]) if "rollover" in data else None,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(limit), 201

    @app.route("/budget/limits/<int:limit_id>", methods=["DELETE"])
    @require_auth
    def budget_limits_delete(limit_id):
        limit = BudgetLimit.query.get_or_404(limit_id)
        if limit.household_id:
            validate_household_id_for_write(str(limit.household_id))
        elif str(limit.user_id) != str(g.user_id):
            abort(403)
        delete_limit(limit_id, g.user_id, str(limit.household_id) if limit.household_id else None)
        return jsonify({"message": "Limit deleted"}), 200

    @app.route("/api/ai/budget-insights", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def ai_budget_insights():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        if not ai_service.is_configured():
            return jsonify({"configured": False, "narrative": None})

        if household_id and household_id not in get_member_household_ids(g.user_id):
            abort(403)
        months = int(data.get("months", 6))
        currency = data.get("currency", "USD").upper()
        summary = get_monthly_summary(
            g.user_id if not household_id else None, household_id, months=months, currency=currency
        )
        try:
            narrative = ai_service.generate_budget_narrative(summary)
        except ai_service.QuotaExceededError as e:
            return jsonify({"error": str(e), "quota_exceeded": True}), 429
        return jsonify({"configured": True, "narrative": narrative})
