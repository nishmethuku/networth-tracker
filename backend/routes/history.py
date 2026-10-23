"""Routes: history. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import abort, g, jsonify, request

from .. import price_service
from ..auth import require_auth
from ..emergency_fund_service import get_emergency_fund_status
from ..holdings_service import (
    get_monthly_net_flow,
)
from ..household_service import (
    get_member_household_ids,
)
from ..models import (
    HoldingTransaction,
    HoldingValuation,
)

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
    limiter = app.extensions["limiter"]
    scoped_holdings_query = h.scoped_holdings_query

    @app.route("/net-worth-history", methods=["GET"])
    @require_auth
    def get_net_worth_history():
        """Real daily snapshots for the caller (or a shared household via
        ?household_id=). Empty until the daily snapshot job has run a few times.
        Snapshots are always stored in USD (see snapshot_service.py), so this
        converts to ?currency= (default USD) before returning — otherwise a
        user on a non-USD display currency would see raw USD figures under
        their currency's symbol, off by the exchange rate."""
        from .models import NetWorthSnapshot

        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403)
            rows = NetWorthSnapshot.query.filter_by(household_id=household_id_param)
        else:
            rows = NetWorthSnapshot.query.filter_by(user_id=g.user_id)

        rows = rows.order_by(NetWorthSnapshot.snapshot_date.asc()).all()

        def convert_row(r):
            d = r.to_dict()
            from_currency = d["currency"] or "USD"
            for field in ("total_net_worth", "total_stock_value", "total_property_value", "total_profit_loss", "total_liabilities"):
                d[field] = price_service.convert(d[field], from_currency, display_currency)
            d["by_asset_type"] = {
                k: price_service.convert(v, from_currency, display_currency) for k, v in d["by_asset_type"].items()
            }
            d["currency"] = display_currency
            return d

        return jsonify([convert_row(r) for r in rows])

    @app.route("/net-worth-history/rebuild", methods=["POST"])
    @require_auth
    @limiter.limit("6 per hour")
    def rebuild_net_worth_history():
        """Fills in past months of the net worth chart from recorded
        transactions and historical prices. Body {"apply": false} (the
        default) only previews; {"apply": true} saves. Never overwrites an
        existing snapshot."""
        from .history_rebuild_service import rebuild_history

        data = request.get_json(silent=True) or {}
        result = rebuild_history(g.user_id, apply=bool(data.get("apply")))
        return jsonify(result), 200

    @app.route("/monthly-flow", methods=["GET"])
    @require_auth
    def get_monthly_flow():
        """Net cash flow per month per asset type — how much money moved
        into/out of each type, not the type's total value. See
        holdings_service.get_monthly_net_flow for the exact math."""
        household_id_param = request.args.get("household_id")
        holdings = scoped_holdings_query(household_id_param).all()
        holding_ids = [h.id for h in holdings]

        transactions = HoldingTransaction.query.filter(
            HoldingTransaction.holding_id.in_(holding_ids),
            HoldingTransaction.deleted_at.is_(None),
        ).all()
        valuations = HoldingValuation.query.filter(HoldingValuation.holding_id.in_(holding_ids)).all()

        currency = request.args.get("currency", "USD").upper()
        months = int(request.args.get("months", 12))
        result = get_monthly_net_flow(holdings, transactions, valuations, display_currency=currency, months=months)
        return jsonify(result)

    @app.route("/emergency-fund", methods=["GET"])
    @require_auth
    def get_emergency_fund():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        currency = request.args.get("currency", "USD").upper()
        months = int(request.args.get("months", 6))
        result = get_emergency_fund_status(
            user_id=g.user_id if not household_id_param else None,
            household_id=household_id_param,
            currency=currency,
            months=months,
        )
        return jsonify(result)
