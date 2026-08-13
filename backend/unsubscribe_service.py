"""
HMAC-signed, one-click email unsubscribe — no login required, since the
person clicking the link in their inbox isn't necessarily signed in. Uses
the same shared secret as /internal/* routes (DIGEST_SECRET, falling back
to SNAPSHOT_SECRET) rather than a separate key.
"""
import base64
import hashlib
import hmac
import os

from .models import db, EmailUnsubscribe

_SECRET = (os.environ.get("DIGEST_SECRET") or os.environ.get("SNAPSHOT_SECRET") or "").encode()


def generate_unsubscribe_token(email: str) -> str:
    email_b64 = base64.urlsafe_b64encode(email.lower().strip().encode()).decode().rstrip("=")
    sig = hmac.new(_SECRET, email_b64.encode(), hashlib.sha256).hexdigest()
    return f"{email_b64}.{sig}"


def verify_unsubscribe_token(token: str):
    """Returns the email the token was issued for, or None if invalid/tampered."""
    if not token or "." not in token:
        return None
    email_b64, _, sig = token.partition(".")
    expected_sig = hmac.new(_SECRET, email_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    padding = "=" * (-len(email_b64) % 4)
    try:
        return base64.urlsafe_b64decode(email_b64 + padding).decode()
    except (ValueError, UnicodeDecodeError):
        return None


def is_unsubscribed(email: str) -> bool:
    return db.session.get(EmailUnsubscribe, email.lower().strip()) is not None


def unsubscribe(email: str):
    email = email.lower().strip()
    if not is_unsubscribed(email):
        db.session.add(EmailUnsubscribe(email=email))
        db.session.commit()
