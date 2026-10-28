"""
Security activity log: a short, append-only history of sensitive things that
happened to a person's account, shown back to them in Settings so they can
spot anything they did not do.

Recording never breaks the action it describes: a failure here is logged and
swallowed. Reading is always scoped to the signed-in user.
"""
import ipaddress
import logging
from typing import List, Optional

from flask import g, has_request_context, request

from .models import AuditEvent, db

logger = logging.getLogger("networth_tracker")

# Every kind of event, with the sentence the Settings page shows for it.
EVENT_LABELS = {
    "data.exported": "Downloaded a copy of your data",
    "data.restored": "Restored data from a backup file",
    "data.deleted": "Deleted all your data",
    "bank.connected": "Connected a bank",
    "bank.disconnected": "Disconnected a bank",
    "household.invited": "Invited someone to a household",
    "household.joined": "Joined a household",
    "household.left": "Left a household",
    "household.member_removed": "Removed a household member",
    "household.deleted": "Deleted a household",
}

MAX_KEPT_PER_USER = 500


def coarse_ip(value: Optional[str]) -> Optional[str]:
    """Drop the host part of an address: 203.0.113.77 becomes 203.0.113.0 and an
    IPv6 address keeps only its first 48 bits."""
    if not value:
        return None
    try:
        addr = ipaddress.ip_address(value)
    except ValueError:
        return None
    if addr.version == 4:
        return str(ipaddress.ip_network(f"{addr}/24", strict=False).network_address)
    return str(ipaddress.ip_network(f"{addr}/48", strict=False).network_address)


def record(event_type: str, user_id=None, detail: Optional[str] = None) -> None:
    """Add one event for the current user (or `user_id`). Never raises."""
    try:
        if event_type not in EVENT_LABELS:
            raise ValueError(f"unknown audit event type: {event_type}")
        uid = user_id or (g.get("user_id") if has_request_context() else None)
        if not uid:
            return
        event = AuditEvent(
            user_id=uid,
            event_type=event_type,
            detail=(detail or None) and detail[:200],
            ip=coarse_ip(request.remote_addr) if has_request_context() else None,
            user_agent=((request.headers.get("User-Agent") or "")[:200] or None) if has_request_context() else None,
            request_id=(g.get("request_id") if has_request_context() else None),
        )
        db.session.add(event)
        db.session.commit()
        _prune(uid)
    except Exception:
        db.session.rollback()
        logger.exception("Could not record security activity (%s)", event_type)


def _prune(user_id) -> None:
    """Keep only the newest MAX_KEPT_PER_USER events so the table cannot grow without bound."""
    try:
        old_ids = (
            db.session.query(AuditEvent.id)
            .filter(AuditEvent.user_id == user_id)
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .offset(MAX_KEPT_PER_USER)
            .all()
        )
        if old_ids:
            AuditEvent.query.filter(AuditEvent.id.in_([row[0] for row in old_ids])).delete(synchronize_session=False)
            db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Could not prune security activity")


def list_events(user_id, limit: int = 50) -> List[dict]:
    limit = max(1, min(int(limit), 100))
    rows = AuditEvent.query.filter_by(user_id=user_id).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit).all()
    return [{**row.to_dict(), "label": EVENT_LABELS.get(row.event_type, row.event_type)} for row in rows]
