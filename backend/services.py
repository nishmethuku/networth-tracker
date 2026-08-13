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
