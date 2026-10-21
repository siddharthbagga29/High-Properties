"""Normalized daily bar schema and source metadata. Bars carry their provenance; nothing downstream knows the vendor."""
from dataclasses import dataclass, asdict
from datetime import date


ADJ_VERIFIED = "split_and_dividend_adjusted"   # total-return series, verified against an independent reference
ADJ_STATUSES = (ADJ_VERIFIED, "adjusted_unspecified", "split_adjusted_only", "unadjusted", "unknown", "n/a")


@dataclass(frozen=True)
class Bar:
    instrument: str
    event_date: date          # trading session date (exchange-local calendar date)
    open: float
    high: float
    low: float
    close: float
    volume: float
    currency: str = "USD"
    source: str = ""
    received_at: str = ""     # when this system obtained the bar (ISO UTC), if known

    def to_dict(self):
        d = asdict(self)
        d["event_date"] = self.event_date.isoformat()
        return d


@dataclass(frozen=True)
class SourceInfo:
    provider: str             # "synthetic", "csv_snapshot", "stooq"
    kind: str                 # "DEMO_SYNTHETIC" | "HISTORICAL_DOWNLOADED" | "HISTORICAL_SNAPSHOT"
    description: str
    retrieved_at: str = ""
    content_sha256: str = ""
    adjusted: str = "unknown"  # ADJ_STATUSES; anything but ADJ_VERIFIED is provisional for real data
    terms: str = ""
    adjustment_evidence: str = ""   # how a human verified the status (reference source, date, ratios); empty = none

    @property
    def is_synthetic(self):
        return self.kind == "DEMO_SYNTHETIC"

    @property
    def adjustment_verified(self):
        return self.adjusted == ADJ_VERIFIED and bool(self.adjustment_evidence.strip())

    @property
    def is_provisional(self):
        """Real data whose split/dividend treatment is not verified. Synthetic data is not 'provisional': it is
        simply not market data."""
        return not self.is_synthetic and not self.adjustment_verified
