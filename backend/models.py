from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
import math

db = SQLAlchemy()


class Asset(db.Model):
    __tablename__ = "assets"

    id = db.Column(db.Integer, primary_key=True)

    # Core (ALL assets)
    asset_type = db.Column(db.String(32), nullable=False)   # stock, real_estate, cash, etc
    country = db.Column(db.String(64), nullable=False)
    account = db.Column(db.String(64), nullable=False)
    purchase_date = db.Column(db.Date, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Market assets (stocks, mutual funds)
    symbol = db.Column(db.String(16))
    units = db.Column(db.Float)
    buy_price = db.Column(db.Float)

    # Real assets (real estate, metals)
    name = db.Column(db.String(128))
    buy_value = db.Column(db.Float)
    current_value = db.Column(db.Float)

    # Cash / deposits / loans
    institution = db.Column(db.String(128))
    value = db.Column(db.Float)

    # User notes and tags
    notes = db.Column(db.Text)
    tags = db.Column(db.String(512))  # Comma-separated tags

    def to_dict(self):
        today = date.today()

        # ---------- BUY VALUE ----------
        buy_value = 0.0
        if self.asset_type in ["stock", "mutual_fund"]:
            if self.units and self.buy_price:
                buy_value = self.units * self.buy_price
        elif self.asset_type in ["real_estate", "metal"]:
            buy_value = self.buy_value or 0.0
        else:  # cash, deposit, loan
            buy_value = self.value or 0.0

        # ---------- CURRENT VALUE ----------
        current_value = 0.0
        if self.asset_type in ["stock", "mutual_fund"]:
            # frontend/backend will inject live price later
            current_value = self.current_value or buy_value
        elif self.asset_type in ["real_estate", "metal"]:
            current_value = self.current_value or buy_value
        else:
            current_value = self.value or 0.0

        # ---------- PROFIT ----------
        profit = current_value - buy_value

        # ---------- PROFIT % ----------
        profit_pct = (profit / buy_value * 100) if buy_value > 0 else 0.0

        # ---------- YEARS HELD ----------
        years_held = max((today - self.purchase_date).days / 365.25, 0.0001)

        # ---------- CAGR ----------
        try:
            cagr = (current_value / buy_value) ** (1 / years_held) - 1
        except Exception:
            cagr = 0.0

        return {
            "id": self.id,
            "asset_type": self.asset_type,
            "country": self.country,
            "account": self.account,
            "purchase_date": self.purchase_date.isoformat(),
            "created_at": self.created_at.isoformat(),

            # Identity
            "symbol": self.symbol,
            "name": self.name,
            "institution": self.institution,

            # Values
            "units": self.units,
            "buy_price": self.buy_price,

            "buy_value": round(buy_value, 2),
            "current_value": round(current_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "cagr": round(cagr, 6),

            # Notes and tags
            "notes": self.notes,
            "tags": self.tags,
        }
