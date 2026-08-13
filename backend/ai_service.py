"""
Anthropic Claude integration shared by every AI feature: copilot chat,
AI-narrated weekly digest, allocation advisor, transaction categorizer, and
natural-language search.

Degrades gracefully when ANTHROPIC_API_KEY isn't set (same pattern as
Finnhub/Resend/metals-api elsewhere in this app) — callers check
is_configured() and return a clear "not configured" response rather than
letting anthropic.Anthropic() raise.

The portfolio snapshot sent to Claude is always summarized (totals +
per-holding key metrics) and never includes the raw transaction ledger, to
keep prompts small and avoid sending more than necessary to a third party.
"""
import json
import os
from typing import Dict, List, Optional

import anthropic

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
AI_MODEL = "claude-sonnet-4-6"

_client: Optional["anthropic.Anthropic"] = None


def is_configured() -> bool:
    return bool(ANTHROPIC_API_KEY)


def get_client() -> Optional["anthropic.Anthropic"]:
    global _client
    if not ANTHROPIC_API_KEY:
        return None
    if _client is None:
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
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
    """Yields text chunks from a streaming Claude response. Raises RuntimeError
    if AI isn't configured — callers should check is_configured() first to
    return a clean 503 rather than let this raise mid-stream."""
    client = get_client()
    if not client:
        raise RuntimeError("AI features are not configured (ANTHROPIC_API_KEY not set)")

    system = COPILOT_SYSTEM_PROMPT + "\n\nPortfolio snapshot (JSON):\n" + json.dumps(portfolio_snapshot)
    with client.messages.stream(
        model=AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text


def generate_digest_narrative(digest_data: Dict, recipient_name: Optional[str] = None) -> Optional[str]:
    """3-4 paragraph narrative for the weekly digest email, from the same
    structured data already computed by digest_service. Returns None if AI
    isn't configured — callers fall back to the structured-only email."""
    client = get_client()
    if not client:
        return None

    greeting = f"Address the recipient/household as '{recipient_name}' if it reads naturally." if recipient_name else ""
    prompt = (
        "Write a warm, specific 3-4 paragraph weekly net worth digest narrative from this data. "
        f"{greeting} Reference real numbers naturally. Keep it grounded and factual — no hype. "
        "Plain text only, no markdown headers.\n\nData (JSON):\n" + json.dumps(digest_data)
    )
    try:
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text if response.content else None
    except anthropic.APIError:
        return None


REBALANCE_SYSTEM_PROMPT = """You are a portfolio allocation advisor inside a personal net worth tracker. \
Given the user's current holdings/allocation and a target allocation goal, write a short narrative \
(2-3 paragraphs) explaining the gap between current and target allocation and the reasoning for the \
suggested changes. The exact rebalance math (units/amounts to buy or sell) is computed separately in \
Python and shown alongside your narrative — don't repeat exact purchase amounts, focus on the "why". \
Always end with a brief, natural note that this isn't financial advice and is for informational purposes."""


def generate_allocation_narrative(current_allocation: Dict, target_allocation: Dict, rebalance_plan: List[Dict]) -> Optional[str]:
    client = get_client()
    if not client:
        return None
    prompt = (
        "Current allocation (JSON): " + json.dumps(current_allocation) +
        "\n\nTarget allocation (JSON): " + json.dumps(target_allocation) +
        "\n\nComputed rebalance plan (JSON): " + json.dumps(rebalance_plan)
    )
    try:
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=500,
            system=REBALANCE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text if response.content else None
    except anthropic.APIError:
        return None


def suggest_transaction_tags(holding_name: str, asset_type: str, transaction_type: str, quantity: float, price_per_unit: float, currency: str) -> Optional[Dict]:
    """Returns {"tags": [...], "note": "..."} or None if AI isn't configured
    or the call fails — callers should treat this as a best-effort suggestion,
    never block the transaction on it."""
    client = get_client()
    if not client:
        return None
    prompt = (
        "Suggest 1-3 short lowercase tags (like 'core-holding', 'speculative', 'dip-buy', 'tax-loss-harvest', "
        "'dividend-play', 'rebalance') and a one-line note for this transaction. Respond with ONLY a JSON object "
        'shaped exactly like {"tags": ["tag1", "tag2"], "note": "one short sentence"}, no other text.\n\n'
        f"Holding: {holding_name} ({asset_type})\n"
        f"Transaction: {transaction_type} {quantity} @ {price_per_unit} {currency}"
    )
    try:
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text if response.content else ""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[raw.find("{"):]
        parsed = json.loads(raw)
        tags = [str(t).lower().strip() for t in parsed.get("tags", [])][:3]
        note = str(parsed.get("note", "")).strip()[:200]
        return {"tags": tags, "note": note}
    except (anthropic.APIError, json.JSONDecodeError, ValueError, KeyError, IndexError):
        return None


SEARCH_SYSTEM_PROMPT = """You translate a natural-language portfolio search query into a JSON filter spec. \
Respond with ONLY a JSON object, no other text, shaped exactly like:
{"asset_types": ["stock", "crypto"], "countries": [], "min_value": null, "max_value": null, \
"min_gain_pct": null, "max_gain_pct": null, "gainers_only": false, "losers_only": false, "text": null}

Omit nothing — include every key, using null/[]/false for anything not implied by the query. \
"text" is for a loose name/symbol substring match if the query names a specific holding. \
Valid asset_types: stock, mutual_fund, crypto, commodity, real_estate, fixed_deposit, ppf, epf, cash, loan."""


def parse_search_query(query: str) -> Optional[Dict]:
    client = get_client()
    if not client:
        return None
    try:
        response = client.messages.create(
            model=AI_MODEL,
            max_tokens=300,
            system=SEARCH_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": query}],
        )
        raw = response.content[0].text if response.content else ""
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[raw.find("{"):]
        return json.loads(raw)
    except (anthropic.APIError, json.JSONDecodeError, ValueError, IndexError):
        return None
