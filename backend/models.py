import uuid
from datetime import datetime, date

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import JSONB, UUID

db = SQLAlchemy()


class Household(db.Model):
    __tablename__ = "households"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.Text, nullable=False)
    owner_id = db.Column(UUID(as_uuid=True), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "owner_id": str(self.owner_id),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class HouseholdMember(db.Model):
    __tablename__ = "household_members"

    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), primary_key=True)
    role = db.Column(db.String(16), nullable=False, default="member")
    joined_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "household_id": str(self.household_id),
            "user_id": str(self.user_id),
            "role": self.role,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }


class HouseholdInvite(db.Model):
    __tablename__ = "household_invites"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), nullable=False)
    invited_email = db.Column(db.Text, nullable=False)
    invited_by = db.Column(UUID(as_uuid=True), nullable=False)
    status = db.Column(db.String(16), nullable=False, default="pending")
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "invited_email": self.invited_email,
            "invited_by": str(self.invited_by),
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Asset(db.Model):
    __tablename__ = "assets"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=False)
    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), nullable=True)

    # Core (ALL assets)
    asset_type = db.Column(db.String(32), nullable=False)   # stock, real_estate, cash, etc
    country = db.Column(db.String(64), nullable=False)
    account = db.Column(db.String(64), nullable=False)
    purchase_date = db.Column(db.Date, nullable=False)

    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
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
            "user_id": str(self.user_id),
            "household_id": str(self.household_id) if self.household_id else None,
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


class NetWorthSnapshot(db.Model):
    __tablename__ = "net_worth_snapshots"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=True)
    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), nullable=True)
    snapshot_date = db.Column(db.Date, nullable=False)
    total_net_worth = db.Column(db.Float, nullable=False)
    total_stock_value = db.Column(db.Float, nullable=False, default=0.0)
    total_property_value = db.Column(db.Float, nullable=False, default=0.0)
    total_profit_loss = db.Column(db.Float, nullable=False, default=0.0)
    by_asset_type = db.Column(JSONB, nullable=False, default=dict)
    currency = db.Column(db.String(8), nullable=False, default="USD")
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": str(self.user_id) if self.user_id else None,
            "household_id": str(self.household_id) if self.household_id else None,
            "snapshot_date": self.snapshot_date.isoformat(),
            "total_net_worth": self.total_net_worth,
            "total_stock_value": self.total_stock_value,
            "total_property_value": self.total_property_value,
            "total_profit_loss": self.total_profit_loss,
            "by_asset_type": self.by_asset_type,
            "currency": self.currency,
        }
