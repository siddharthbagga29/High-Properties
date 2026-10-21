"""Small, deterministic statistics helpers for research reports (standard library only)."""
import math
import random
import statistics

DAYS = 252


def sharpe(rets):
    if len(rets) < 2:
        return None
    sd = statistics.stdev(rets)
    return statistics.fmean(rets) / sd * math.sqrt(DAYS) if sd > 0 else None


def max_drawdown(equity):
    peak, worst = -math.inf, 0.0
    for e in equity:
        peak = max(peak, e)
        if peak > 0:
            worst = min(worst, e / peak - 1)
    return worst


def block_bootstrap(a, b=None, n_boot=1000, block=10, seed=11, level=0.95):
    """Moving-block bootstrap of annualised Sharpe for series `a` and, if `b` is given, of Sharpe(a) - Sharpe(b)
    using the SAME resampled days for both (paired). Deterministic for a given seed. Blocks preserve short-range
    autocorrelation; they do not remove regime dependence, so the interval is a lower bound on real uncertainty."""
    n = len(a)
    if n < 2 * block or (b is not None and len(b) != n):
        return None
    rng = random.Random(seed)
    blocks = math.ceil(n / block)
    sa, sd = [], []
    for _ in range(n_boot):
        idx = []
        for _ in range(blocks):
            s = rng.randrange(0, n - block + 1)
            idx.extend(range(s, s + block))
        idx = idx[:n]
        ra = sharpe([a[i] for i in idx])
        if ra is None:
            continue
        sa.append(ra)
        if b is not None:
            rb = sharpe([b[i] for i in idx])
            if rb is not None:
                sd.append(ra - rb)
    lo, hi = (1 - level) / 2, 1 - (1 - level) / 2

    def ci(xs):
        if len(xs) < n_boot * 0.9:
            return None
        xs = sorted(xs)
        return [xs[int(lo * (len(xs) - 1))], xs[int(hi * (len(xs) - 1))]]
    return {"n_boot": n_boot, "block": block, "seed": seed, "level": level,
            "sharpe_ci": ci(sa), "sharpe_diff_ci": ci(sd) if b is not None else None}
