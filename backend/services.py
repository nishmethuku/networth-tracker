"""
Small shared helpers used across the API layer.
"""


def safe_float(value) -> float:
    """Safely convert value to float, defaulting to 0.0"""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def rank_symbol_results(results, query: str):
    """
    Re-orders /search-symbols results so the closest match to what was
    typed comes first, rather than trusting each upstream source's raw
    order — e.g. typing "Apple" should surface AAPL above unrelated
    cross-listings or loosely-related company names. A stable sort by a
    relevance tier (lower is better), preserving each source's original
    relative order within a tier.
    """
    query_upper = (query or "").strip().upper()
    if not query_upper:
        return results

    def tier(result):
        symbol = (result.get("symbol") or "").upper()
        display_symbol = (result.get("displaySymbol") or "").upper()
        description = (result.get("description") or "").upper()

        if symbol == query_upper or display_symbol == query_upper:
            return 0
        if symbol.startswith(query_upper) or display_symbol.startswith(query_upper):
            return 1
        if description.startswith(query_upper):
            return 2
        if query_upper in description:
            return 3
        return 4

    return sorted(results, key=tier)
