"""Routes: milestones. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import abort, g, jsonify, request

from ..auth import require_auth
from ..household_service import (
    get_member_household_ids,
)
from ..milestone_service import list_milestones
from ..models import (
    Milestone,
    db,
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
    @app.route("/milestones", methods=["GET"])
    @require_auth
    def get_milestones():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        return jsonify(list_milestones(
            user_id=g.user_id if not household_id_param else None, household_id=household_id_param
        ))

    @app.route("/milestones/<int:milestone_id>/acknowledge", methods=["PUT"])
    @require_auth
    def acknowledge_milestone_route(milestone_id):
        milestone = Milestone.query.get_or_404(milestone_id)
        if milestone.user_id is not None:
            if str(milestone.user_id) != str(g.user_id):
                abort(403)
        elif milestone.household_id is not None:
            if str(milestone.household_id) not in get_member_household_ids(g.user_id):
                abort(403)
        else:
            abort(403)
        milestone.acknowledged = True
        db.session.commit()
        return jsonify(milestone.to_dict())
