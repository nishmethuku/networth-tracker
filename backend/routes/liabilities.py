"""Routes: liabilities. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os
from datetime import date

from flask import g, jsonify, request

from ..auth import require_auth
from ..holdings_service import (
    build_funding_valuation,
)
from ..liability_service import (
    LIABILITY_TYPES,
    apply_payment,
    list_liabilities_with_display,
)
from ..models import (
    HoldingValuation,
    Liability,
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
    scoped_liabilities_query = h.scoped_liabilities_query
    validate_household_id_for_write = h.validate_household_id_for_write
    validate_household_reassignment = h.validate_household_reassignment

    @app.route("/liabilities", methods=["POST"])
    @require_auth
    def create_liability():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        if data.get("liability_type") not in LIABILITY_TYPES:
            return jsonify({"error": f"liability_type must be one of {LIABILITY_TYPES}"}), 400
        if not data.get("name") or not str(data["name"]).strip():
            return jsonify({"error": "name is required"}), 400

        raw_due = data.get("payment_due_date")
        try:
            payment_due = date.fromisoformat(raw_due) if raw_due else None
        except ValueError:
            return jsonify({"error": "payment_due_date must be YYYY-MM-DD"}), 400

        liability = Liability(
            user_id=g.user_id,
            household_id=household_id,
            name=data["name"].strip(),
            liability_type=data["liability_type"],
            currency=data.get("currency", "USD"),
            current_balance=safe_float(data.get("current_balance")),
            original_amount=safe_float(data["original_amount"]) if data.get("original_amount") not in (None, "") else None,
            interest_rate=safe_float(data["interest_rate"]) if data.get("interest_rate") not in (None, "") else None,
            monthly_payment=safe_float(data["monthly_payment"]) if data.get("monthly_payment") not in (None, "") else None,
            payment_due_date=payment_due,
            notes=data.get("notes"),
            is_private=bool(data.get("is_private", False)),
        )
        db.session.add(liability)
        db.session.commit()
        return jsonify(liability.to_dict()), 201

    @app.route("/liabilities", methods=["GET"])
    @require_auth
    def get_liabilities():
        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        liabilities = scoped_liabilities_query(household_id_param).order_by(Liability.created_at.desc()).all()
        return jsonify(list_liabilities_with_display(liabilities, display_currency=display_currency))

    @app.route("/liabilities/<int:liability_id>", methods=["PUT"])
    @require_auth
    def update_liability(liability_id):
        liability = get_authorized_liability(liability_id, require_write=True)
        data = request.get_json(force=True)

        if "household_id" in data:
            validate_household_reassignment(liability.user_id, data["household_id"])
            liability.household_id = data["household_id"]
        if "liability_type" in data:
            if data["liability_type"] not in LIABILITY_TYPES:
                return jsonify({"error": f"liability_type must be one of {LIABILITY_TYPES}"}), 400
            liability.liability_type = data["liability_type"]
        if "name" in data:
            if not data["name"] or not str(data["name"]).strip():
                return jsonify({"error": "name is required"}), 400
            liability.name = data["name"].strip()
        for field in ("currency", "notes"):
            if field in data:
                setattr(liability, field, data[field])
        if "current_balance" in data:
            liability.current_balance = safe_float(data["current_balance"])
        if "original_amount" in data:
            liability.original_amount = safe_float(data["original_amount"]) if data["original_amount"] not in (None, "") else None
        if "interest_rate" in data:
            liability.interest_rate = safe_float(data["interest_rate"]) if data["interest_rate"] not in (None, "") else None
        if "monthly_payment" in data:
            liability.monthly_payment = safe_float(data["monthly_payment"]) if data["monthly_payment"] not in (None, "") else None
        if "payment_due_date" in data:
            raw_due = data["payment_due_date"]
            try:
                liability.payment_due_date = date.fromisoformat(raw_due) if raw_due else None
            except ValueError:
                return jsonify({"error": "payment_due_date must be YYYY-MM-DD"}), 400
        if "is_private" in data:
            liability.is_private = bool(data["is_private"])

        db.session.commit()
        return jsonify(liability.to_dict())

    @app.route("/liabilities/<int:liability_id>/payments", methods=["POST"])
    @require_auth
    def record_liability_payment(liability_id):
        """Record a payment on a liability (a credit card bill, a loan
        installment): lowers its balance and, if a cash account is given,
        takes the money out of that account. Deliberately not a Budget entry,
        so a card bill is not counted as spending a second time."""
        liability = get_authorized_liability(liability_id, require_write=True)
        data = request.get_json(force=True)

        amount = safe_float(data.get("amount"))
        if not amount or amount <= 0:
            return jsonify({"error": "amount must be greater than 0"}), 400
        currency = data.get("currency") or liability.currency
        try:
            paid_on = date.fromisoformat(data["payment_date"]) if data.get("payment_date") else date.today()
        except ValueError:
            return jsonify({"error": "payment_date must be YYYY-MM-DD"}), 400

        funding_valuation = None
        funding_source_id = data.get("funding_source_holding_id")
        if funding_source_id:
            source_holding = get_authorized_holding(funding_source_id, require_write=True)
            source_valuations = HoldingValuation.query.filter_by(holding_id=source_holding.id).all()
            try:
                funding_valuation = build_funding_valuation(source_holding, source_valuations, amount, currency, paid_on, g.user_id)
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
            db.session.add(funding_valuation)

        apply_payment(liability, amount, currency)
        db.session.commit()
        return jsonify({
            "liability": liability.to_dict(),
            "funding_source": funding_valuation.to_dict() if funding_valuation else None,
        }), 201

    @app.route("/liabilities/<int:liability_id>", methods=["DELETE"])
    @require_auth
    def delete_liability(liability_id):
        liability = get_authorized_liability(liability_id, require_write=True)
        db.session.delete(liability)
        db.session.commit()
        return jsonify({"message": "Liability deleted"}), 200
