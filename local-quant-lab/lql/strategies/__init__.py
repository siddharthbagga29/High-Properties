"""Strategy interface and registry. Strategies receive only the bars up to the decision time (the engine slices the
history), return a target portfolio weight in [0, 1] (long-only in v1), and declare their metadata."""
import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class StrategyMeta:
    key: str
    name: str
    version: str
    description: str
    warmup: int                       # bars needed before the first non-flat signal
    params: dict = field(default_factory=dict)
    required_fields: tuple = ("close",)
    max_weight: float = 1.0


class Strategy:
    meta: StrategyMeta

    def target_weight(self, history):
        """history: list of Bar up to and including the decision bar. Return a weight in [0, max_weight]."""
        raise NotImplementedError


def sma(values, n):
    """Simple moving average of the last n values; None if not enough history. Uses past values only."""
    if n <= 0 or len(values) < n:
        return None
    return sum(values[-n:]) / n


class BuyAndHold(Strategy):
    def __init__(self):
        self.meta = StrategyMeta("buy_hold", "Buy and hold", "1.0.0",
                                 "Fully invested from the first bar. Baseline and benchmark.", warmup=0)

    def target_weight(self, history):
        return 1.0 if history else 0.0


class SMATrend(Strategy):
    """Long when the close is above its slow moving average and the fast average is above the slow one; flat
    otherwise. Interpretable trend-following rule used to exercise the full pipeline, not a claimed edge."""

    def __init__(self, fast=50, slow=200):
        if not 0 < fast < slow:
            raise ValueError("need 0 < fast < slow")
        self.fast, self.slow = fast, slow
        self.meta = StrategyMeta("sma_trend", "SMA trend", "1.0.0",
                                 f"Long if close > SMA{slow} and SMA{fast} > SMA{slow}, else flat.",
                                 warmup=slow, params={"fast": fast, "slow": slow})

    def target_weight(self, history):
        closes = [b.close for b in history]
        f, s = sma(closes, self.fast), sma(closes, self.slow)
        if f is None or s is None:
            return 0.0
        return 1.0 if closes[-1] > s and f > s else 0.0


class VolScaledTrend(Strategy):
    """Trend filter with volatility targeting. Long only while the close is above its slow moving average; the
    weight is target_vol / realised_vol (annualised, from the last `vol_lookback` daily close-to-close returns),
    capped at 1 and rounded down to steps of 0.05 so the position does not churn on tiny volatility changes.

    Why it might help: it stays out of downtrends and shrinks exposure when the market turns violent, which should
    cut drawdowns relative to buy-and-hold. What it assumes: volatility clusters and trends persist for a while.
    What breaks it: sharp reversals (whipsaw), gaps (volatility is measured on closes), a regime with no trend.
    Baselines: buy-and-hold and the plain SMA trend rule. Not a claimed edge; the walk-forward process decides."""

    def __init__(self, slow=150, vol_lookback=20, target_vol_pct=10):
        if slow < 20 or not 5 <= vol_lookback <= slow or not 1 <= target_vol_pct <= 50:
            raise ValueError("need slow >= 20, 5 <= vol_lookback <= slow, 1 <= target_vol_pct <= 50")
        self.slow, self.vol_lookback, self.target = slow, vol_lookback, target_vol_pct / 100.0
        self.meta = StrategyMeta(
            "vol_scaled_trend", "Volatility-scaled trend", "1.0.0",
            f"Long if close > SMA{slow}; weight = min(1, {target_vol_pct}% / realised {vol_lookback}-day vol), "
            "in steps of 0.05.", warmup=max(slow, vol_lookback + 1),
            params={"slow": slow, "vol_lookback": vol_lookback, "target_vol_pct": target_vol_pct})

    def target_weight(self, history):
        closes = [b.close for b in history]
        s = sma(closes, self.slow)
        if s is None or len(closes) < self.vol_lookback + 1 or closes[-1] <= s:
            return 0.0
        window = closes[-(self.vol_lookback + 1):]
        rets = [window[i] / window[i - 1] - 1 for i in range(1, len(window))]
        mean = sum(rets) / len(rets)
        var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
        vol = var ** 0.5 * 252 ** 0.5
        if vol <= 1e-9:
            return 1.0
        return math.floor(min(1.0, self.target / vol) / 0.05) * 0.05


REGISTRY = {"buy_hold": BuyAndHold, "sma_trend": SMATrend, "vol_scaled_trend": VolScaledTrend}


def create(key, **params):
    if key not in REGISTRY:
        raise KeyError(f"unknown strategy {key}; registered: {sorted(REGISTRY)}")
    return REGISTRY[key](**params)


def register(key, cls):
    """Add a strategy without touching the backtester. Refuses to overwrite an existing key."""
    if key in REGISTRY:
        raise KeyError(f"strategy {key} already registered")
    REGISTRY[key] = cls


def catalog():
    out = []
    for k, cls in REGISTRY.items():
        m = cls().meta
        out.append({"key": m.key, "name": m.name, "version": m.version, "description": m.description,
                    "warmup": m.warmup, "params": m.params})
    return out
