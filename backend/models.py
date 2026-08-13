import uuid
from datetime import datetime

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
    role = db.Column(db.String(16), nullable=False, default="editor")
    status = db.Column(db.String(16), nullable=False, default="pending")
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "invited_email": self.invited_email,
            "invited_by": str(self.invited_by),
            "role": self.role,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Holding(db.Model):
    __tablename__ = "holdings"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=False)
    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), nullable=True)

    asset_type = db.Column(db.String(32), nullable=False)
    symbol = db.Column(db.String(32))
    name = db.Column(db.String(128), nullable=False)
    country = db.Column(db.String(64), nullable=False)
    account = db.Column(db.String(64), nullable=False)
    institution = db.Column(db.String(128))
    currency = db.Column(db.String(8), nullable=False)

    interest_rate = db.Column(db.Float)
    maturity_date = db.Column(db.Date)

    # Recurring investment (SIP) tracking — optional, only meaningful for
    # quantity-based types. sip_frequency: 'weekly' | 'monthly' | 'quarterly'.
    sip_amount = db.Column(db.Float)
    sip_frequency = db.Column(db.String(16))
    sip_start_date = db.Column(db.Date)

    is_private = db.Column(db.Boolean, nullable=False, default=False)
    notes = db.Column(db.Text)
    tags = db.Column(db.String(512))
    status = db.Column(db.String(16), nullable=False, default="active")

    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": str(self.user_id),
            "household_id": str(self.household_id) if self.household_id else None,
            "asset_type": self.asset_type,
            "symbol": self.symbol,
            "name": self.name,
            "country": self.country,
            "account": self.account,
            "institution": self.institution,
            "currency": self.currency,
            "interest_rate": self.interest_rate,
            "maturity_date": self.maturity_date.isoformat() if self.maturity_date else None,
            "sip_amount": self.sip_amount,
            "sip_frequency": self.sip_frequency,
            "sip_start_date": self.sip_start_date.isoformat() if self.sip_start_date else None,
            "is_private": self.is_private,
            "notes": self.notes,
            "tags": self.tags,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class HoldingTransaction(db.Model):
    __tablename__ = "holding_transactions"

    id = db.Column(db.BigInteger, primary_key=True)
    holding_id = db.Column(db.BigInteger, db.ForeignKey("holdings.id"), nullable=False)
    user_id = db.Column(UUID(as_uuid=True), nullable=False)
    transaction_type = db.Column(db.String(8), nullable=False)  # buy | sell
    transaction_date = db.Column(db.Date, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    price_per_unit = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(8), nullable=False)
    fees = db.Column(db.Float, nullable=False, default=0.0)
    notes = db.Column(db.Text)
    tags = db.Column(JSONB)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "holding_id": self.holding_id,
            "user_id": str(self.user_id),
            "transaction_type": self.transaction_type,
            "transaction_date": self.transaction_date.isoformat(),
            "quantity": self.quantity,
            "price_per_unit": self.price_per_unit,
            "currency": self.currency,
            "fees": self.fees,
            "notes": self.notes,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class HoldingValuation(db.Model):
    __tablename__ = "holding_valuations"

    id = db.Column(db.BigInteger, primary_key=True)
    holding_id = db.Column(db.BigInteger, db.ForeignKey("holdings.id"), nullable=False)
    user_id = db.Column(UUID(as_uuid=True), nullable=False)
    valuation_date = db.Column(db.Date, nullable=False)
    value = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(8), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "holding_id": self.holding_id,
            "user_id": str(self.user_id),
            "valuation_date": self.valuation_date.isoformat(),
            "value": self.value,
            "currency": self.currency,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PriceHistory(db.Model):
    __tablename__ = "price_history"

    id = db.Column(db.BigInteger, primary_key=True)
    asset_type = db.Column(db.String(32), nullable=False)
    symbol = db.Column(db.String(32), nullable=False)
    price_date = db.Column(db.Date, nullable=False)
    price = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(8), nullable=False)
    source = db.Column(db.String(32))
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "asset_type": self.asset_type,
            "symbol": self.symbol,
            "price_date": self.price_date.isoformat(),
            "price": self.price,
            "currency": self.currency,
            "source": self.source,
        }


class ExchangeRate(db.Model):
    __tablename__ = "exchange_rates"

    id = db.Column(db.BigInteger, primary_key=True)
    base_currency = db.Column(db.String(8), nullable=False)
    quote_currency = db.Column(db.String(8), nullable=False)
    rate_date = db.Column(db.Date, nullable=False)
    rate = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "base_currency": self.base_currency,
            "quote_currency": self.quote_currency,
            "rate_date": self.rate_date.isoformat(),
            "rate": self.rate,
        }


class NetWorthSnapshot(db.Model):
    __tablename__ = "net_worth_snapshots"
    __table_args__ = (
        db.Index("net_worth_snapshots_user_date_idx", "user_id", "snapshot_date"),
        db.Index("net_worth_snapshots_household_date_idx", "household_id", "snapshot_date"),
    )

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


class PriceAlert(db.Model):
    __tablename__ = "price_alerts"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=False)
    holding_id = db.Column(db.BigInteger, db.ForeignKey("holdings.id"), nullable=True)
    symbol = db.Column(db.String(32))
    asset_type = db.Column(db.String(32))
    alert_type = db.Column(db.String(24), nullable=False)  # price_above | price_below | net_worth_above | net_worth_below
    threshold = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(8), nullable=False, default="USD")
    status = db.Column(db.String(16), nullable=False, default="active")
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    triggered_at = db.Column(db.DateTime(timezone=True))

    def to_dict(self):
        return {
            "id": self.id,
            "holding_id": self.holding_id,
            "symbol": self.symbol,
            "asset_type": self.asset_type,
            "alert_type": self.alert_type,
            "threshold": self.threshold,
            "currency": self.currency,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
        }


class EmailUnsubscribe(db.Model):
    __tablename__ = "email_unsubscribes"

    email = db.Column(db.Text, primary_key=True)
    unsubscribed_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "email": self.email,
            "unsubscribed_at": self.unsubscribed_at.isoformat() if self.unsubscribed_at else None,
        }


class Milestone(db.Model):
    __tablename__ = "milestones"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=True)
    household_id = db.Column(UUID(as_uuid=True), db.ForeignKey("households.id"), nullable=True)
    threshold = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(8), nullable=False)
    achieved_date = db.Column(db.Date, nullable=False)
    acknowledged = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": str(self.user_id) if self.user_id else None,
            "household_id": str(self.household_id) if self.household_id else None,
            "threshold": self.threshold,
            "currency": self.currency,
            "achieved_date": self.achieved_date.isoformat(),
            "acknowledged": self.acknowledged,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
