"""Controlled settings layer. Risk limits and cost assumptions are loaded from config/settings.json and validated.

Fail closed: a missing or malformed setting raises ConfigError, and the risk engine treats that as a rejection.
Agents (Hermes or any LLM) never write this file; only a human edits it. `tighten()` is the only programmatic way to
change limits, and it can only make them stricter.
"""
import json
from dataclasses import dataclass, field, asdict, replace
from pathlib import Path

from . import ROOT

SETTINGS = ROOT / "config" / "settings.json"
EXECUTION_MODES = ("SIMULATED", "BROKER_PAPER")  # there is deliberately no LIVE mode


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class RiskLimits:
    allowed_instruments: tuple
    max_order_qty: int
    max_order_notional: float
    max_position_notional: float      # per instrument
    max_gross_exposure: float         # sum |position notional|
    max_concentration: float          # max share of equity in one instrument (0-1)
    max_daily_loss: float             # currency, realised + unrealised vs start-of-day equity
    max_drawdown: float               # fraction of peak equity (0-1)
    max_orders_per_window: int
    order_window_seconds: int
    price_band: float                 # max |limit or reference price / last trusted close - 1|
    max_data_age_seconds: int         # stale-data lockout (for paper mode clocks)
    allow_short: bool = False


@dataclass(frozen=True)
class CostModel:
    commission_per_share: float
    min_commission: float
    half_spread_bps: float
    slippage_bps: float


@dataclass(frozen=True)
class Settings:
    risk: RiskLimits
    costs: CostModel
    initial_cash: float
    execution_mode: str
    currency: str = "USD"
    extra: dict = field(default_factory=dict)


def _require(d, key, typ):
    if key not in d:
        raise ConfigError(f"missing setting: {key}")
    v = d[key]
    if typ is float and isinstance(v, int) and not isinstance(v, bool):
        v = float(v)
    if not isinstance(v, typ) or isinstance(v, bool) and typ is not bool:
        raise ConfigError(f"setting {key} must be {typ.__name__}")
    return v


def parse(d):
    try:
        r, c = d["risk"], d["costs"]
    except (KeyError, TypeError):
        raise ConfigError("settings need 'risk' and 'costs' sections")
    risk = RiskLimits(
        allowed_instruments=tuple(_require(r, "allowed_instruments", list)),
        max_order_qty=_require(r, "max_order_qty", int),
        max_order_notional=_require(r, "max_order_notional", float),
        max_position_notional=_require(r, "max_position_notional", float),
        max_gross_exposure=_require(r, "max_gross_exposure", float),
        max_concentration=_require(r, "max_concentration", float),
        max_daily_loss=_require(r, "max_daily_loss", float),
        max_drawdown=_require(r, "max_drawdown", float),
        max_orders_per_window=_require(r, "max_orders_per_window", int),
        order_window_seconds=_require(r, "order_window_seconds", int),
        price_band=_require(r, "price_band", float),
        max_data_age_seconds=_require(r, "max_data_age_seconds", int),
        allow_short=bool(r.get("allow_short", False)),
    )
    costs = CostModel(
        commission_per_share=_require(c, "commission_per_share", float),
        min_commission=_require(c, "min_commission", float),
        half_spread_bps=_require(c, "half_spread_bps", float),
        slippage_bps=_require(c, "slippage_bps", float),
    )
    mode = _require(d, "execution_mode", str)
    if mode not in EXECUTION_MODES:
        raise ConfigError(f"execution_mode must be one of {EXECUTION_MODES}; live trading does not exist in this build")
    if risk.allow_short:
        raise ConfigError("short selling is disabled in v1")
    for name in ("max_concentration", "max_drawdown", "price_band"):
        if not 0 < getattr(risk, name) <= 1:
            raise ConfigError(f"{name} must be in (0, 1]")
    for name in ("max_order_qty", "max_order_notional", "max_position_notional", "max_gross_exposure",
                 "max_daily_loss", "max_orders_per_window", "order_window_seconds", "max_data_age_seconds"):
        if getattr(risk, name) <= 0:
            raise ConfigError(f"{name} must be positive")
    if not risk.allowed_instruments:
        raise ConfigError("allowed_instruments is empty")
    if min(costs.commission_per_share, costs.min_commission, costs.half_spread_bps, costs.slippage_bps) < 0:
        raise ConfigError("costs cannot be negative")
    return Settings(risk=risk, costs=costs, initial_cash=_require(d, "initial_cash", float),
                    execution_mode=mode, currency=d.get("currency", "USD"))


def load(path=SETTINGS):
    try:
        return parse(json.loads(Path(path).read_text()))
    except FileNotFoundError:
        raise ConfigError(f"settings file not found: {path}")
    except json.JSONDecodeError as e:
        raise ConfigError(f"settings file is not valid JSON: {e}")


STRICTER_IS_SMALLER = ("max_order_qty", "max_order_notional", "max_position_notional", "max_gross_exposure",
                       "max_concentration", "max_daily_loss", "max_drawdown", "max_orders_per_window", "price_band",
                       "max_data_age_seconds")


def tighten(limits, **proposed):
    """Apply a recommendation (for example from an agent) only where it makes a limit stricter. Returns (new_limits,
    applied, refused)."""
    applied, refused = {}, {}
    for k, v in proposed.items():
        if k in STRICTER_IS_SMALLER and isinstance(v, (int, float)) and 0 < v <= getattr(limits, k):
            applied[k] = type(getattr(limits, k))(v)
        elif k == "allowed_instruments" and set(v) <= set(limits.allowed_instruments) and v:
            applied[k] = tuple(v)
        else:
            refused[k] = v
    return replace(limits, **applied), applied, refused


def as_dict(settings):
    return asdict(settings)
