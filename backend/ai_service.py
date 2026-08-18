"""
Google Gemini integration shared by every AI feature: copilot chat,
AI-narrated weekly digest, allocation advisor, transaction categorizer, and
natural-language search. Uses Gemini specifically because it has a real,
ongoing free tier (unlike Anthropic's API, which is pay-as-you-go after a
one-time trial credit) — a meaningful cost consideration for a family app.

Degrades gracefully when GEMINI_API_KEY isn't set (same pattern as
Finnhub/Resend/metals-api elsewhere in this app) — callers check
is_configured() and return a clear "not configured" response rather than
letting genai.Client() raise.

The portfolio snapshot sent to the model is always summarized (totals +
per-holding key metrics) and never includes the raw transaction ledger, to
keep prompts small and avoid sending more than necessary to a third party.

Every public function signature here matches what the previous
Anthropic-based version exposed, so app.py/digest_service.py/
smart_import_service.py didn't need to change when this was swapped —
only this module's internals did.
"""
import json
import os
import time
from typing import Dict, List, Optional

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# Gemini's free-tier Flash endpoint occasionally returns a transient 500/503
# under load ("please try again later") with no client-side cause — every
# retrying call below gets one automatic retry for exactly these codes.
_RETRYABLE_STATUS_CODES = {500, 503}
_RETRY_DELAY_SECONDS = 1.5


def _is_retryable(exc: BaseException) -> bool:
    return isinstance(exc, genai_errors.ServerError) and getattr(exc, "code", None) in _RETRYABLE_STATUS_CODES


def _friendly_error(exc: BaseException) -> str:
    """chat_stream re-raises so app.py's SSE handler can report a failure —
    but the raw SDK exception text includes internal quota metric names and
    doc URLs that shouldn't reach an end user's chat window."""
    if isinstance(exc, genai_errors.ClientError) and getattr(exc, "code", None) == 429:
        return "The AI assistant has hit its free daily usage limit — please try again later."
    if isinstance(exc, genai_errors.APIError):
        return "The AI assistant is temporarily unavailable — please try again in a moment."
    return "Something went wrong talking to the AI assistant."
# An alias Google hot-swaps to the current best Flash model (with a 2-week
# deprecation notice for breaking changes), rather than a dated model
# string that eventually gets shut down — e.g. gemini-2.5-flash's planned
# retirement is exactly the kind of thing this avoids having to track.
AI_MODEL = "gemini-flash-latest"

_client: Optional["genai.Client"] = None


def is_configured() -> bool:
    return bool(GEMINI_API_KEY)


def get_client() -> Optional["genai.Client"]:
    global _client
    if not GEMINI_API_KEY:
        return None
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def build_portfolio_snapshot(
    holdings_with_metrics: List[Dict], dashboard: Dict, display_currency: str = "USD"
) -> Dict:
    holdings_summary = []
    for h in holdings_with_metrics:
        entry = {
            "name": h["name"],
            "asset_type": h["asset_type"],
            "symbol": h.get("symbol"),
            "country": h["country"],
            "native_currency": h["currency"],
            "current_value": round(h.get("display_value", 0.0), 2),
        }
        if "unrealized_gain" in h:
            entry["unrealized_gain"] = round(h["unrealized_gain"], 2)
            entry["realized_gain"] = round(h.get("realized_gain", 0.0), 2)
            entry["xirr_pct"] = round(h["xirr"] * 100, 2) if h.get("xirr") is not None else None
        holdings_summary.append(entry)

    return {
        "display_currency": display_currency,
        "total_net_worth": dashboard.get("total_net_worth"),
        "allocation_by_type": dashboard.get("allocation_by_type"),
        "allocation_by_country": dashboard.get("allocation_by_country"),
        "realized_gain": dashboard.get("realized_gain"),
        "unrealized_gain": dashboard.get("unrealized_gain"),
        "top_gainers": dashboard.get("top_gainers"),
        "top_losers": dashboard.get("top_losers"),
        "holdings": holdings_summary,
    }


def _extract_json(raw: str):
    """Strips a ```json ... ``` fence if present, then parses. Every prompt
    below asks for a bare JSON object, but models sometimes wrap it anyway."""
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{"):]
    return json.loads(raw)


def generate_text(prompt: str, system: Optional[str] = None, max_tokens: int = 1024) -> Optional[str]:
    """Single-turn completion, or None if AI isn't configured or the call
    fails. Shared by every non-streaming caller in this module (and by
    smart_import_service, which needs a raw completion outside the
    specific helpers below) so the SDK-specific call shape lives in
    exactly one place."""
    client = get_client()
    if not client:
        return None
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=AI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
            )
            return response.text
        except Exception as e:
            if attempt == 0 and _is_retryable(e):
                time.sleep(_RETRY_DELAY_SECONDS)
                continue
            return None


COPILOT_SYSTEM_PROMPT = """You are the financial copilot built into a personal net worth tracker app. \
You have access to the user's current portfolio snapshot (below, as JSON) — real totals, allocation, \
gains, and per-holding values. Use it to answer questions and offer specific, grounded observations.

Rules:
- Be concise. Prefer short paragraphs or a few bullet points over long essays.
- Reference real numbers from the snapshot when relevant, formatted naturally (not raw JSON).
- You are not a licensed financial advisor. For anything resembling specific buy/sell/allocation advice, \
add a brief, natural disclaimer (not a legal boilerplate wall) that this isn't financial advice.
- If the snapshot has no holdings, say so and suggest adding one.
- Never invent numbers not present in the snapshot.
"""


def chat_stream(messages: List[Dict], portfolio_snapshot: Dict):
    """Yields text chunks from a streaming Gemini response. Raises
    RuntimeError if AI isn't configured — callers should check
    is_configured() first to return a clean 503 rather than let this raise
    mid-stream."""
    client = get_client()
    if not client:
        raise RuntimeError("AI features are not configured (GEMINI_API_KEY not set)")

    system = COPILOT_SYSTEM_PROMPT + "\n\nPortfolio snapshot (JSON):\n" + json.dumps(portfolio_snapshot)
    # Claude's message roles (user/assistant) map to Gemini's (user/model).
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
    ]

    # A retryable error before any chunk has been yielded is safe to retry
    # from scratch; once output has reached the caller, retrying would
    # duplicate it, so at that point any error just propagates.
    for attempt in range(2):
        yielded_any = False
        try:
            stream = client.models.generate_content_stream(
                model=AI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=1024),
            )
            for chunk in stream:
                if chunk.text:
                    yielded_any = True
                    yield chunk.text
            return
        except Exception as e:
            if attempt == 0 and not yielded_any and _is_retryable(e):
                time.sleep(_RETRY_DELAY_SECONDS)
                continue
            if isinstance(e, genai_errors.APIError):
                raise RuntimeError(_friendly_error(e)) from e
            raise


def generate_digest_narrative(digest_data: Dict, recipient_name: Optional[str] = None) -> Optional[str]:
    """3-4 paragraph narrative for the weekly digest email, from the same
    structured data already computed by digest_service. Returns None if AI
    isn't configured — callers fall back to the structured-only email."""
    greeting = f"Address the recipient/household as '{recipient_name}' if it reads naturally." if recipient_name else ""
    prompt = (
        "Write a warm, specific 3-4 paragraph weekly net worth digest narrative from this data. "
        f"{greeting} Reference real numbers naturally. Keep it grounded and factual — no hype. "
        "Plain text only, no markdown headers.\n\nData (JSON):\n" + json.dumps(digest_data)
    )
    return generate_text(prompt, max_tokens=600)


def generate_budget_narrative(summary_data: Dict) -> Optional[str]:
    """On-demand (not automatic — see budget_service/app.py) 2-3 paragraph
    narrative over the Budget page's monthly summary: trends, the biggest
    category, anything notable in limit_status. Returns None if AI isn't
    configured or the call fails; callers show a clean 'not configured'
    state rather than blocking on this."""
    prompt = (
        "Write a warm, specific 2-3 paragraph spending insights narrative from this budget data — "
        "trends across the months shown, the biggest spending category, and anything notable about "
        "spending limits if present (e.g. close to or over a limit). Reference real numbers naturally. "
        "Keep it grounded and factual — no hype, no generic advice. Plain text only, no markdown headers.\n\n"
        "Data (JSON):\n" + json.dumps(summary_data)
    )
    return generate_text(prompt, max_tokens=500)


REBALANCE_SYSTEM_PROMPT = """You are a portfolio allocation advisor inside a personal net worth tracker. \
Given the user's current holdings/allocation and a target allocation goal, write a short narrative \
(2-3 paragraphs) explaining the gap between current and target allocation and the reasoning for the \
suggested changes. The exact rebalance math (units/amounts to buy or sell) is computed separately in \
Python and shown alongside your narrative — don't repeat exact purchase amounts, focus on the "why". \
Always end with a brief, natural note that this isn't financial advice and is for informational purposes."""


def generate_allocation_narrative(current_allocation: Dict, target_allocation: Dict, rebalance_plan: List[Dict]) -> Optional[str]:
    prompt = (
        "Current allocation (JSON): " + json.dumps(current_allocation) +
        "\n\nTarget allocation (JSON): " + json.dumps(target_allocation) +
        "\n\nComputed rebalance plan (JSON): " + json.dumps(rebalance_plan)
    )
    return generate_text(prompt, system=REBALANCE_SYSTEM_PROMPT, max_tokens=500)


def suggest_transaction_tags(holding_name: str, asset_type: str, transaction_type: str, quantity: float, price_per_unit: float, currency: str) -> Optional[Dict]:
    """Returns {"tags": [...], "note": "..."} or None if AI isn't configured
    or the call fails — callers should treat this as a best-effort suggestion,
    never block the transaction on it."""
    prompt = (
        "Suggest 1-3 short lowercase tags (like 'core-holding', 'speculative', 'dip-buy', 'tax-loss-harvest', "
        "'dividend-play', 'rebalance') and a one-line note for this transaction. Respond with ONLY a JSON object "
        'shaped exactly like {"tags": ["tag1", "tag2"], "note": "one short sentence"}, no other text.\n\n'
        f"Holding: {holding_name} ({asset_type})\n"
        f"Transaction: {transaction_type} {quantity} @ {price_per_unit} {currency}"
    )
    raw = generate_text(prompt, max_tokens=200)
    if not raw:
        return None
    try:
        parsed = _extract_json(raw)
        tags = [str(t).lower().strip() for t in parsed.get("tags", [])][:3]
        note = str(parsed.get("note", "")).strip()[:200]
        return {"tags": tags, "note": note}
    except (json.JSONDecodeError, ValueError, KeyError, IndexError):
        return None


SEARCH_SYSTEM_PROMPT = """You translate a natural-language portfolio search query into a JSON filter spec. \
Respond with ONLY a JSON object, no other text, shaped exactly like:
{"asset_types": ["stock", "crypto"], "countries": [], "min_value": null, "max_value": null, \
"min_gain_pct": null, "max_gain_pct": null, "gainers_only": false, "losers_only": false, "text": null}

Omit nothing — include every key, using null/[]/false for anything not implied by the query. \
"text" is for a loose name/symbol substring match if the query names a specific holding. \
Valid asset_types: stock, mutual_fund, crypto, commodity, real_estate, fixed_deposit, ppf, epf, cash, loan."""


def parse_search_query(query: str) -> Optional[Dict]:
    raw = generate_text(query, system=SEARCH_SYSTEM_PROMPT, max_tokens=300)
    if not raw:
        return None
    try:
        return _extract_json(raw)
    except (json.JSONDecodeError, ValueError, IndexError):
        return None
