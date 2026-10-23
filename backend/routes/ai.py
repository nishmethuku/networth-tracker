"""Routes: ai. Moved out of app.py unchanged; shared helpers come in through `h`."""
import json
import logging
import os

from flask import Response, g, jsonify, request

from .. import ai_service
from ..allocation_service import compute_rebalance_plan, validate_target_allocation
from ..allocation_target_service import clear_target_allocation, get_target_allocation, save_target_allocation
from ..auth import require_auth
from ..holdings_service import (
    build_dashboard,
    list_holdings_with_metrics,
)
from ..liability_service import (
    total_liabilities_display,
)
from ..models import (
    Holding,
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
    get_authorized_transaction = h.get_authorized_transaction
    limiter = app.extensions["limiter"]
    require_ai_access = h.require_ai_access
    scoped_holdings_query = h.scoped_holdings_query
    scoped_liabilities_query = h.scoped_liabilities_query

    def _portfolio_snapshot_for_caller(household_id, currency="USD"):
        holdings = scoped_holdings_query(household_id).all()
        holdings_by_id = {h.id: h for h in holdings}
        holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency=currency)
        liabilities = scoped_liabilities_query(household_id).all()
        total_liabilities = total_liabilities_display(liabilities, display_currency=currency)
        dashboard = build_dashboard(
            holdings_with_metrics, holdings_by_id, display_currency=currency, total_liabilities=total_liabilities
        )
        return ai_service.build_portfolio_snapshot(holdings_with_metrics, dashboard, currency), dashboard

    @app.route("/api/ai/chat", methods=["POST"])
    @require_auth
    @limiter.limit("5 per minute")
    def ai_chat():
        if not ai_service.is_configured():
            return jsonify({"error": "AI features aren't configured yet", "code": "ai_not_configured"}), 503

        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        messages = data.get("messages")
        if not messages or not isinstance(messages, list):
            return jsonify({"error": "messages is required"}), 400
        messages = messages[-20:]  # cap history sent per request

        currency = data.get("currency", "USD")
        snapshot, _ = _portfolio_snapshot_for_caller(household_id, currency)

        def generate():
            try:
                for chunk in ai_service.chat_stream(messages, snapshot):
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.warning("AI chat stream failed: %s: %s", type(e).__name__, e)
                # Once streaming has started, Flask's @app.errorhandler(Exception)
                # never runs for this response -- it only handles exceptions
                # raised before the response begins -- so this is the only
                # place sanitizing happens for this route. chat_stream already
                # wraps Gemini API errors in a user-safe message, but anything
                # else (a genuine bug here, a network-level error) must not
                # reach the client as raw str(e) the way every other route's
                # errorhandler already prevents.
                safe_message = str(e) if isinstance(e, RuntimeError) else "Something went wrong. Please try again."
                yield f"data: {json.dumps({'error': safe_message})}\n\n"

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.route("/api/ai/allocation-advisor", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def ai_allocation_advisor():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        target_allocation = data.get("target_allocation")
        if not isinstance(target_allocation, dict):
            return jsonify({"error": "target_allocation is required (asset_type -> percent)"}), 400
        try:
            validate_target_allocation(target_allocation)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        currency = data.get("currency", "USD")
        _, dashboard = _portfolio_snapshot_for_caller(household_id, currency)
        plan = compute_rebalance_plan(dashboard["allocation_by_type"], dashboard["total_assets"], target_allocation)

        narrative = None
        quota_exceeded = False
        if ai_service.is_configured():
            current_allocation = {a["label"]: a["value"] for a in dashboard["allocation_by_type"]}
            try:
                narrative = ai_service.generate_allocation_narrative(current_allocation, target_allocation, plan)
            except ai_service.QuotaExceededError:
                quota_exceeded = True

        return jsonify({
            "ai_configured": ai_service.is_configured(),
            "rebalance_plan": plan,
            "narrative": narrative,
            "quota_exceeded": quota_exceeded,
            "disclaimer": "This is informational only, generated from your own portfolio data, and is not financial advice.",
        })

    # A category more than this many percentage points off its saved target
    # counts as "drifted" for the on-page-load check below.
    ALLOCATION_DRIFT_THRESHOLD_PCT = 5.0

    @app.route("/allocation-targets", methods=["GET"])
    @require_auth
    def get_allocation_targets_route():
        return jsonify(get_target_allocation(g.user_id))

    @app.route("/allocation-targets", methods=["PUT"])
    @require_auth
    def save_allocation_targets_route():
        data = request.get_json(force=True) or {}
        target_allocation = data.get("target_allocation")
        if not isinstance(target_allocation, dict):
            return jsonify({"error": "target_allocation is required (asset_type -> percent)"}), 400
        try:
            validate_target_allocation(target_allocation)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        saved = save_target_allocation(g.user_id, target_allocation)
        return jsonify(saved), 201

    @app.route("/allocation-targets", methods=["DELETE"])
    @require_auth
    def clear_allocation_targets_route():
        clear_target_allocation(g.user_id)
        return jsonify({"message": "Target allocation cleared"}), 200

    @app.route("/allocation-drift", methods=["GET"])
    @require_auth
    def allocation_drift_route():
        """Fast, AI-free drift check against the caller's saved target
        allocation (if any) — no narrative, just the same rebalance math the
        AI advisor already computes, so this is cheap enough to run on
        every Dashboard/Allocation Advisor page load."""
        target_allocation = get_target_allocation(g.user_id)
        if not target_allocation:
            return jsonify({"has_target": False})

        currency = request.args.get("currency", "USD").upper()
        _, dashboard = _portfolio_snapshot_for_caller(None, currency)
        plan = compute_rebalance_plan(dashboard["allocation_by_type"], dashboard["total_assets"], target_allocation)
        max_drift_pct = max((abs(p["current_pct"] - p["target_pct"]) for p in plan), default=0.0)

        return jsonify({
            "has_target": True,
            "target_allocation": target_allocation,
            "plan": plan,
            "max_drift_pct": round(max_drift_pct, 2),
            "is_drifted": max_drift_pct > ALLOCATION_DRIFT_THRESHOLD_PCT,
        })

    @app.route("/transactions/<int:transaction_id>/suggest-tags", methods=["POST"])
    @require_auth
    @limiter.limit("20 per minute")
    def ai_suggest_transaction_tags(transaction_id):
        tx = get_authorized_transaction(transaction_id, require_write=True)
        holding = Holding.query.get(tx.holding_id)
        require_ai_access(str(holding.household_id) if holding.household_id else None)

        if not ai_service.is_configured():
            return jsonify({"configured": False, "suggestion": None})

        suggestion = ai_service.suggest_transaction_tags(
            holding.name, holding.asset_type, tx.transaction_type, tx.quantity, tx.price_per_unit, tx.currency
        )
        return jsonify({"configured": True, "suggestion": suggestion})

    @app.route("/api/ai/search", methods=["POST"])
    @require_auth
    @limiter.limit("20 per minute")
    def ai_search():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        query = (data.get("query") or "").strip()
        if not query:
            return jsonify({"error": "query is required"}), 400

        if not ai_service.is_configured():
            return jsonify({"configured": False, "filter_spec": None})

        try:
            filter_spec = ai_service.parse_search_query(query)
        except ai_service.QuotaExceededError as e:
            return jsonify({"error": str(e), "quota_exceeded": True}), 429
        return jsonify({"configured": True, "filter_spec": filter_spec})
