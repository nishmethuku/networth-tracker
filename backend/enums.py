"""
Domain enums for asset types and countries
Ensures type safety and validation
"""

from enum import Enum


class AssetType(str, Enum):
    """Supported asset types"""
    STOCK = "stock"
    MUTUAL_FUND = "mutual_fund"
    REAL_ESTATE = "real_estate"
    METAL = "metal"
    CASH = "cash"
    DEPOSIT = "deposit"
    LOAN = "loan"

    @classmethod
    def values(cls):
        """Return list of all enum values"""
        return [e.value for e in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid asset type"""
        try:
            cls(value)
            return True
        except ValueError:
            return False


class Country(str, Enum):
    """Common countries (extend as needed)"""
    US = "US"
    UK = "UK"
    CANADA = "Canada"
    INDIA = "India"
    AUSTRALIA = "Australia"
    GERMANY = "Germany"
    FRANCE = "France"
    JAPAN = "Japan"
    OTHER = "Other"

    @classmethod
    def values(cls):
        """Return list of all enum values"""
        return [e.value for e in cls]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid country (allows any string, but enum provides common ones)"""
        return bool(value and value.strip())


# Common account types (can be extended to enum if needed)
ACCOUNT_TYPES = [
    "Brokerage",
    "Retirement",
    "Savings",
    "Checking",
    "Investment",
    "Other",
]
