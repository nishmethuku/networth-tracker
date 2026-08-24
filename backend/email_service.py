"""
Shared email sending via Resend (https://resend.com — free tier, no domain
verification needed to start since we use their shared onboarding@resend.dev
sender). Used by the weekly digest and price alerts.

Same "gracefully absent" pattern as FINNHUB_API_KEY/METALS_API_KEY: without
RESEND_API_KEY set, send() logs what would have been sent instead of failing
the caller, so digest/alert computation still works and is inspectable even
before an email provider is configured.
"""
import base64
import os
import requests

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_ADDRESS = os.environ.get("EMAIL_FROM", "Net Worth Tracker <onboarding@resend.dev>")
# RENDER_EXTERNAL_URL is set automatically by Render for web services — no
# manual env var needed in the common case; BACKEND_PUBLIC_URL overrides it
# for local/other-host testing.
BACKEND_URL = os.environ.get("BACKEND_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or ""


def send(to_email: str, subject: str, html: str, attachments: list = None) -> bool:
    """Send an email. Returns True if actually sent, False if only logged
    (no RESEND_API_KEY) or if the send failed. attachments, if given, is a
    list of (filename, raw_bytes) tuples — base64-encoded here since that's
    the wire format Resend's API expects, so callers just deal in bytes."""
    if not RESEND_API_KEY:
        print(f"[email_service] RESEND_API_KEY not set — would send to {to_email}: {subject}")
        return False

    payload = {"from": FROM_ADDRESS, "to": [to_email], "subject": subject, "html": html}
    if attachments:
        payload["attachments"] = [
            {"filename": filename, "content": base64.b64encode(content).decode("ascii")}
            for filename, content in attachments
        ]

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json=payload,
            timeout=10,
        )
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"[email_service] Send failed to {to_email}: {e}")
        return False


def _card(label: str, value: str) -> str:
    return (
        f'<div style="display:inline-block;padding:12px 16px;margin:4px;'
        f'background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'
        f'<div style="font-size:12px;color:#64748b;">{label}</div>'
        f'<div style="font-size:18px;font-weight:700;color:#0f172a;">{value}</div></div>'
    )


def render_digest_email(digest: dict, narrative: str = None, unsubscribe_token: str = None, backup_attached: bool = False) -> str:
    movers_html = "".join(
        f'<li>{m["name"]}: {"+" if m["unrealized_gain"] >= 0 else ""}{m["unrealized_gain"]:.2f}</li>'
        for m in digest.get("top_movers", [])
    )
    change = digest.get("change_this_week")
    change_html = f'{"+" if change and change >= 0 else ""}{change:.2f}' if change is not None else "—"

    narrative_html = (
        "".join(f'<p style="color:#334155;line-height:1.6;">{p}</p>' for p in narrative.strip().split("\n\n"))
        if narrative
        else ""
    )

    unsubscribe_html = ""
    if unsubscribe_token and BACKEND_URL:
        unsubscribe_url = f"{BACKEND_URL}/internal/unsubscribe?token={unsubscribe_token}"
        unsubscribe_html = (
            f'<p style="margin-top:24px;font-size:12px;color:#94a3b8;">'
            f'<a href="{unsubscribe_url}" style="color:#94a3b8;">Unsubscribe from weekly digests</a></p>'
        )

    backup_html = (
        '<p style="margin-top:16px;font-size:13px;color:#64748b;">'
        "📎 A backup of your data (holdings, transactions, budget entries) is attached as a zip of CSV files."
        "</p>"
        if backup_attached
        else ""
    )

    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0f172a;">Your Weekly Net Worth Digest</h2>
      {narrative_html}
      <div>
        {_card("Net Worth", f'${digest.get("net_worth", 0):,.2f}')}
        {_card("Change This Week", change_html)}
      </div>
      {f'<h3 style="color:#0f172a;">Top Movers</h3><ul>{movers_html}</ul>' if movers_html else ""}
      {backup_html}
      {unsubscribe_html}
    </div>
    """


def render_alert_email(alert: dict, current_value: float) -> str:
    label = alert.get("symbol") or "Net Worth"
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0f172a;">Price Alert Triggered</h2>
      <p><strong>{label}</strong> {alert["alert_type"].replace("_", " ")} your threshold of
      {alert["threshold"]:,.2f} {alert["currency"]}.</p>
      <p>Current value: <strong>{current_value:,.2f} {alert["currency"]}</strong></p>
    </div>
    """
