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


# ---- explicit data states and what each may be used for (docs/audit/data-source-review.md) --------------------------
# The research gates enforce these: the critic never gives SYNTHETIC or PROVISIONAL data a CANDIDATE verdict, walk-forward
# fails `not_synthetic` / `price_adjustment_verified`, the holdout refuses provisional or synthetic registrations, and a
# forward log that ever saw unverified adjustment stays provisional for good. No state is eligible for real orders:
# this build has no broker adapter and no live mode.
SYNTHETIC = "SYNTHETIC"
IMPORTED_UNVERIFIED = "IMPORTED_UNVERIFIED"   # imported, validation not run (or not yet passed) - unusable
PROVISIONAL = "PROVISIONAL"                   # real data, passes validation, split/dividend treatment unverified
VERIFIED_HISTORICAL = "VERIFIED_HISTORICAL"   # real data, passes validation, adjustment verified with evidence
LIVE_FEED = "LIVE_FEED"                       # not supported in this build; listed so nothing can claim it silently
REJECTED = "REJECTED"                         # failed validation or its manifest/hash check
DATA_STATES = (SYNTHETIC, IMPORTED_UNVERIFIED, PROVISIONAL, VERIFIED_HISTORICAL, LIVE_FEED, REJECTED)
USES = ("software_tests", "simulated_paper_replay", "research_run", "research_evidence", "candidate_verdict",
        "holdout", "forward_paper_evidence", "real_orders")
_ELIGIBLE = {
    SYNTHETIC: {"software_tests", "simulated_paper_replay", "research_run"},
    IMPORTED_UNVERIFIED: set(),
    PROVISIONAL: {"software_tests", "simulated_paper_replay", "research_run"},
    VERIFIED_HISTORICAL: {"software_tests", "simulated_paper_replay", "research_run", "research_evidence",
                          "candidate_verdict", "holdout", "forward_paper_evidence"},
    LIVE_FEED: set(),
    REJECTED: set(),
}


def dataset_state(info, quality=None):
    """The data state of a loaded dataset. `quality` (a QualityReport) None means validation has not run."""
    if quality is not None and not quality.passes_validation:
        return REJECTED
    if info.is_synthetic:
        return SYNTHETIC
    if quality is None or not info.content_sha256:      # not validated, or not yet frozen into a hashed snapshot
        return IMPORTED_UNVERIFIED
    return VERIFIED_HISTORICAL if info.adjustment_verified else PROVISIONAL


def eligible(state, use):
    if use not in USES:
        raise ValueError(f"unknown use {use!r}")
    return use in _ELIGIBLE.get(state, set())


def eligibility(state):
    return {u: eligible(state, u) for u in USES}
