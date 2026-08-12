"""
Service layer for business logic and calculations
Separates calculation logic from Flask routes
"""

from datetime import date
from typing import Dict, List, Optional

from .models import Asset
from .utils import get_current_stock_price
from .finance import calculate_cagr


def safe_float(value) -> float:
    """Safely convert value to float, defaulting to 0.0"""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def calculate_asset_metrics(asset: Asset, fetch_live_price: bool = False) -> Dict:
    """
    Calculate buy_value, current_value, profit, profit_pct, and CAGR for a single asset.
    Handles all asset types with proper edge cases.
    
    Args:
        asset: The asset to calculate metrics for
        fetch_live_price: If True, fetch live stock prices. If False, use stored current_value.
                         Default False to avoid slow API calls on every request.
    """
    buy_value = 0.0
    current_value = 0.0

    if asset.asset_type in ("stock", "mutual_fund"):
        units = safe_float(asset.units)
        buy_price = safe_float(asset.buy_price)
        
        buy_value = units * buy_price
        
        # Fetch live price if requested, otherwise use stored value or buy_value
        if fetch_live_price and asset.symbol:
            # Always fetch live price when requested, ignore stored values
            # Pass asset_type to help determine if we should use mftool for mutual funds
            price = get_current_stock_price(asset.symbol, asset_type=asset.asset_type)
            if price:
                current_value = units * safe_float(price)
            else:
                # If price fetch fails, fall back to stored value or buy_value
                current_value = safe_float(asset.current_value) if asset.current_value is not None else buy_value
        elif asset.current_value is not None:
            # Use stored current_value if available and not fetching live
            current_value = safe_float(asset.current_value)
        else:
            # Default to buy_value if no stored value and not fetching live
            current_value = buy_value

    elif asset.asset_type in ("real_estate", "metal"):
        buy_value = safe_float(asset.buy_value)
        current_value = safe_float(asset.current_value) if asset.current_value else buy_value

    elif asset.asset_type in ("cash", "deposit"):
        buy_value = safe_float(asset.value)
        current_value = safe_float(asset.value)

    elif asset.asset_type == "loan":
        # Loans are negative values
        buy_value = -safe_float(asset.value)
        current_value = -safe_float(asset.value)

    # Calculate profit
    profit = current_value - buy_value

    # Calculate profit percentage (handle division by zero)
    if abs(buy_value) > 0.01:  # Avoid division by very small numbers
        profit_pct = (profit / abs(buy_value)) * 100.0
    else:
        profit_pct = 0.0

    # Calculate CAGR (handle negative values and zero buy_value)
    if abs(buy_value) > 0.01 and abs(current_value) > 0.01:
        cagr = calculate_cagr(abs(buy_value), abs(current_value), asset.purchase_date)
    else:
        cagr = 0.0

    return {
        "buy_value": buy_value,
        "current_value": current_value,
        "profit": profit,
        "profit_pct": profit_pct,
        "cagr": cagr,
    }


def aggregate_totals(metrics_list: List[Dict]) -> Dict:
    """Aggregate metrics from multiple assets into totals"""
    totals = {
        "buy_value": 0.0,
        "current_value": 0.0,
        "profit": 0.0,
        "profit_pct": 0.0,
        "cagr": 0.0,
    }

    for metrics in metrics_list:
        totals["buy_value"] += metrics["buy_value"]
        totals["current_value"] += metrics["current_value"]
        totals["profit"] += metrics["profit"]

    # Calculate aggregate profit percentage
    if abs(totals["buy_value"]) > 0.01:
        totals["profit_pct"] = (totals["profit"] / abs(totals["buy_value"])) * 100.0

    # Calculate aggregate CAGR (weighted by buy_value)
    if abs(totals["buy_value"]) > 0.01 and abs(totals["current_value"]) > 0.01:
        # Use earliest purchase date from all assets for CAGR calculation
        # This is a simplification - for accurate aggregate CAGR, we'd need the actual dates
        earliest_date = min(
            (m.get("purchase_date", date.today()) for m in metrics_list if m.get("purchase_date")),
            default=date.today()
        )
        totals["cagr"] = calculate_cagr(
            abs(totals["buy_value"]),
            abs(totals["current_value"]),
            earliest_date
        )

    return totals


def aggregate_cash_by_account(assets: List[Asset]) -> List[Dict]:
    """
    Aggregate cash assets by account and country.
    Returns grouped cash accounts with current balance and transaction history.
    
    Each cash entry represents a monthly balance update.
    The latest entry (by purchase_date) determines the current balance.
    """
    from collections import defaultdict
    
    # Group cash assets by (account, country)
    grouped = defaultdict(list)
    
    for asset in assets:
        if asset.asset_type == "cash":
            key = (asset.account, asset.country)
            grouped[key].append(asset)
    
    results = []
    
    for (account, country), cash_entries in grouped.items():
        # Sort by purchase_date (oldest first)
        cash_entries.sort(key=lambda a: a.purchase_date)
        
        # Current balance is the latest entry's value
        latest_entry = cash_entries[-1]
        current_balance = safe_float(latest_entry.value)
        
        # Build transaction history
        history = []
        previous_balance = None
        
        for entry in cash_entries:
            balance = safe_float(entry.value)
            change = None
            
            if previous_balance is not None:
                change = balance - previous_balance
            else:
                change = balance  # First entry
            
            history.append({
                "date": entry.purchase_date.isoformat(),
                "balance": balance,
                "change": change,
                "entry_id": entry.id,
                "notes": entry.notes,
                "tags": entry.tags.split(",") if entry.tags else [],
            })
            
            previous_balance = balance
        
        # Get metadata from latest entry
        institution = latest_entry.institution or account
        
        results.append({
            "id": f"cash_account_{account}_{country}",  # Synthetic ID for grouped account
            "asset_type": "cash",
            "account": account,
            "country": country,
            "institution": institution,
            "current_balance": current_balance,
            "current_value": current_balance,  # For compatibility with existing metrics
            "buy_value": current_balance,  # For compatibility
            "profit": 0.0,  # Cash doesn't have profit
            "profit_pct": 0.0,
            "cagr": 0.0,
            "purchase_date": latest_entry.purchase_date.isoformat(),  # Last updated date
            "created_at": cash_entries[0].created_at.isoformat(),  # First entry date
            "history": history,
            "entry_count": len(cash_entries),
            "notes": latest_entry.notes,  # Latest notes
            "tags": latest_entry.tags,  # Latest tags
            "is_grouped": True,  # Flag to indicate this is a grouped account
        })
    
    # Sort results by account name
    results.sort(key=lambda x: (x["country"], x["account"]))
    
    return results
