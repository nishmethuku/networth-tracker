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
import html as html_lib
import logging
import os

import requests

logger = logging.getLogger(__name__)

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
        logger.info("RESEND_API_KEY not set — would send to %s: %s", to_email, subject)
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
        logger.error("Send failed to %s: %s", to_email, e)
        return False


def _card(label: str, value: str) -> str:
    return (
        f'<div style="display:inline-block;padding:12px 16px;margin:4px;'
        f'background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">'
        f'<div style="font-size:12px;color:#64748b;">{label}</div>'
        f'<div style="font-size:18px;font-weight:700;color:#0f172a;">{value}</div></div>'
    )


def render_digest_email(digest: dict, narrative: str = None, unsubscribe_token: str = None, backup_attached: bool = False) -> str:
    # A holding's name is a freeform user-entered (or CSV/AI-imported)
    # string, not a fixed enum -- escape it before it lands in an HTML
    # email, especially for a household digest where it's someone else's
    # holding rendering in every member's inbox.
    movers_html = "".join(
        f'<li>{html_lib.escape(m["name"])}: {"+" if m["unrealized_gain"] >= 0 else ""}{m["unrealized_gain"]:.2f}</li>'
        for m in digest.get("top_movers", [])
    )
    change = digest.get("change_this_week")
    change_html = f'{"+" if change and change >= 0 else ""}{change:.2f}' if change is not None else "—"

    # AI-generated prose, not markup -- escape before wrapping in <p> tags.
    # Not directly user-controlled, but a holding name quoted verbatim in
    # the narrative could carry HTML through indirectly.
    narrative_html = (
        "".join(f'<p style="color:#334155;line-height:1.6;">{html_lib.escape(p)}</p>' for p in narrative.strip().split("\n\n"))
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

    # A gentle nudge, not a guilt trip -- only shown to someone who's used
    # Budget before but has gone quiet for a while (see digest_service.py's
    # NUDGE_AFTER_DAYS), folded into the digest they're already reading
    # rather than a separate email/unsubscribe list of its own.
    nudge_html = ""
    if digest.get("needs_budget_nudge"):
        days = digest.get("days_since_budget_entry")
        days_text = f"in {days} days" if days is not None else "in a while"
        nudge_html = (
            f'<p style="margin-top:16px;padding:12px 16px;background:#fffbeb;border-radius:8px;'
            f'border:1px solid #fde68a;font-size:13px;color:#92400e;">'
            f"💡 You haven't logged any income or expenses {days_text} — a couple of minutes on the "
            f"Budget page keeps this picture current."
            f"</p>"
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
      {nudge_html}
      {unsubscribe_html}
    </div>
    """


def render_monthly_email(report: dict, name: str = None, unsubscribe_token: str = None) -> str:
    """Monthly report email. Every user-entered string (holding names) is
    escaped before it lands in the HTML."""
    esc = html_lib.escape
    change = report.get("change")
    pct = report.get("change_pct")
    if change is None:
        change_text = "—"
    else:
        sign = "+" if change >= 0 else "-"
        change_text = f"{sign}${abs(change):,.2f}" + (f" ({sign}{abs(pct):.1f}%)" if pct is not None else "")

    holdings_html = "".join(
        f'<li>{esc(str(h["name"]))}: ${h["value"]:,.2f} ({h["pct"]:.0f}% of assets)</li>' for h in report.get("top_holdings", [])
    )
    conc = report.get("concentration")
    conc_html = (
        f'<p style="margin-top:16px;padding:12px 16px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;'
        f'font-size:13px;color:#92400e;">{esc(str(conc["name"]))} is {conc["pct"]:.0f}% of your assets. '
        f"That is a lot in one place, so it may be worth a look.</p>"
        if conc
        else ""
    )
    greeting = f"Hi {esc(name)}, here" if name else "Here"
    unsubscribe_html = ""
    if unsubscribe_token and BACKEND_URL:
        url = f"{BACKEND_URL}/internal/unsubscribe?token={unsubscribe_token}"
        unsubscribe_html = (
            f'<p style="margin-top:24px;font-size:12px;color:#94a3b8;">'
            f'<a href="{url}" style="color:#94a3b8;">Unsubscribe from these emails</a></p>'
        )
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0f172a;">Your {esc(report.get("month_label", "Monthly"))} Report</h2>
      <p style="color:#334155;line-height:1.6;">{greeting} is how your month went.</p>
      <div>
        {_card("Net Worth", f'${report.get("net_worth", 0):,.2f}')}
        {_card("Change This Month", change_text)}
        {_card("Dividends and Interest", f'${report.get("income", 0):,.2f}')}
      </div>
      {f'<h3 style="color:#0f172a;">Biggest Positions</h3><ul>{holdings_html}</ul>' if holdings_html else ""}
      {conc_html}
      {unsubscribe_html}
    </div>
    """


def render_alert_email(alert: dict, current_value: float) -> str:
    label = html_lib.escape(alert["symbol"]) if alert.get("symbol") else "Net Worth"
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0f172a;">Price Alert Triggered</h2>
      <p><strong>{label}</strong> {alert["alert_type"].replace("_", " ")} your threshold of
      {alert["threshold"]:,.2f} {alert["currency"]}.</p>
      <p>Current value: <strong>{current_value:,.2f} {alert["currency"]}</strong></p>
    </div>
    """
