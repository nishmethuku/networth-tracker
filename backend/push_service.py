"""
Web Push notifications (https://web.dev/articles/push-notifications-overview)
for triggered alerts -- a free, keyless-to-the-browser complement to the
existing email alerts, sent to a user's own VAPID keypair this app owns
(generated once, see .env.example), not a third-party push provider.

Same "gracefully absent" pattern as email_service.py's RESEND_API_KEY:
without VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY set, send_to_user logs instead
of sending, so alert evaluation still works end to end before push is
configured.
"""
import json
import logging
import os

from pywebpush import WebPushException, webpush

from .models import PushSubscription, db

logger = logging.getLogger(__name__)

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:support@example.com")


def is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def send_to_user(user_id, title: str, body: str, url: str = "/alerts") -> int:
    """Push a notification to every device/browser this user has
    subscribed on. Returns how many actually sent. A subscription that's
    expired or been revoked by the browser (410 Gone, or 404 if the push
    service has forgotten it entirely) is deleted here rather than kept
    around to fail forever -- any other error is logged and left alone,
    since it might be transient (the push service itself having a bad
    moment) rather than something permanently wrong with the
    subscription."""
    if not is_configured():
        logger.info("VAPID keys not set — would push to user %s: %s", user_id, title)
        return 0

    subscriptions = PushSubscription.query.filter_by(user_id=user_id).all()
    sent = 0
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as e:
            status = e.response.status_code if e.response is not None else None
            if status in (404, 410):
                db.session.delete(sub)
                db.session.commit()
            else:
                logger.warning("Push to subscription %s failed: %s", sub.id, e)
    return sent
