"""Routes: transfers of money between two of a person's cash accounts."""
from datetime import date

from flask import g, jsonify, request

from ..auth import require_auth
from ..holdings_service import build_deposit_valuation, build_funding_valuation
from ..models import AccountTransfer, Holding, HoldingValuation, db
from ..services import safe_float


def register(app, h):
    get_authorized_holding = h.get_authorized_holding

    def _cash(holding_id, label):
        holding = get_authorized_holding(holding_id, require_write=True)
        if holding.asset_type != "cash":
            raise ValueError(f"The {label} account must be a cash account")
        return holding

    @app.route("/transfers", methods=["GET"])
    @require_auth
    def list_transfers():
        rows = AccountTransfer.query.filter_by(user_id=g.user_id).order_by(
            AccountTransfer.transfer_date.desc(), AccountTransfer.id.desc()
        ).limit(200).all()
        return jsonify([r.to_dict() for r in rows])

    @app.route("/transfers", methods=["POST"])
    @require_auth
    def create_transfer():
        data = request.get_json(force=True)
        amount = safe_float(data.get("amount"))
        if not amount or amount <= 0:
            return jsonify({"error": "amount must be greater than 0"}), 400
        try:
            paid_on = date.fromisoformat(data["transfer_date"]) if data.get("transfer_date") else date.today()
        except ValueError:
            return jsonify({"error": "transfer_date must be YYYY-MM-DD"}), 400
        if paid_on > date.today():
            return jsonify({"error": "transfer_date can't be in the future"}), 400
        if not data.get("from_holding_id") or not data.get("to_holding_id"):
            return jsonify({"error": "Pick the account the money leaves and the account it goes into"}), 400
        if str(data["from_holding_id"]) == str(data["to_holding_id"]):
            return jsonify({"error": "Pick two different accounts"}), 400
        note = (data.get("note") or "").strip()[:200] or None

        try:
            source = _cash(data["from_holding_id"], "source")
            target = _cash(data["to_holding_id"], "destination")
            currency = data.get("currency") or source.currency
            out = build_funding_valuation(
                source,
                HoldingValuation.query.filter_by(holding_id=source.id).all(),
                amount,
                currency,
                paid_on,
                g.user_id,
                notes=f"Transfer to {target.name}",
                require_funds=True,
            )
            into = build_deposit_valuation(
                target,
                HoldingValuation.query.filter_by(holding_id=target.id).all(),
                amount,
                currency,
                paid_on,
                g.user_id,
                notes=f"Transfer from {source.name}",
            )
        except ValueError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 400

        db.session.add(out)
        db.session.add(into)
        record = AccountTransfer(
            user_id=g.user_id,
            from_holding_id=source.id,
            to_holding_id=target.id,
            from_name=source.name,
            to_name=target.name,
            amount=amount,
            currency=currency,
            transfer_date=paid_on,
            note=note,
        )
        db.session.add(record)
        db.session.commit()
        return jsonify({"transfer": record.to_dict(), "from_balance": out.to_dict(), "to_balance": into.to_dict()}), 201

    @app.route("/transfers/<int:transfer_id>", methods=["DELETE"])
    @require_auth
    def delete_transfer(transfer_id):
        """Undoes a transfer: the money goes back to the account it left, and the record is removed."""
        record = AccountTransfer.query.get_or_404(transfer_id)
        if str(record.user_id) != str(g.user_id):
            return jsonify({"error": "Forbidden"}), 403
        # An account removed by the user is only soft-deleted, so its id is still on the record.
        # With either account gone there is nothing to move back, so just clear the entry.
        def _gone(holding_id):
            if not holding_id:
                return True
            holding = Holding.query.get(holding_id)
            return holding is None or holding.deleted_at is not None

        if _gone(record.from_holding_id) or _gone(record.to_holding_id):
            db.session.delete(record)
            db.session.commit()
            return jsonify({"message": "Transfer removed. One of its accounts no longer exists, so no balance was changed"}), 200
        try:
            source = _cash(record.from_holding_id, "source")
            target = _cash(record.to_holding_id, "destination")
            today = date.today()
            back = build_deposit_valuation(
                source,
                HoldingValuation.query.filter_by(holding_id=source.id).all(),
                record.amount,
                record.currency,
                today,
                g.user_id,
                notes=f"Transfer to {target.name} undone",
            )
            away = build_funding_valuation(
                target,
                HoldingValuation.query.filter_by(holding_id=target.id).all(),
                record.amount,
                record.currency,
                today,
                g.user_id,
                notes=f"Transfer from {source.name} undone",
            )
        except ValueError as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 400
        db.session.add(back)
        db.session.add(away)
        db.session.delete(record)
        db.session.commit()
        return jsonify({"message": "Transfer undone"}), 200
