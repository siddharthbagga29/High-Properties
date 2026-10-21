"""Normalized daily bar schema and source metadata. Bars carry their provenance; nothing downstream knows the vendor."""
from dataclasses import dataclass, asdict
from datetime import date


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
    adjusted: str = "unknown"  # "adjusted" | "unadjusted" | "unknown"
    terms: str = ""

    @property
    def is_synthetic(self):
        return self.kind == "DEMO_SYNTHETIC"
