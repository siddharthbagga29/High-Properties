# NautilusTrader parity proof of concept (isolated)

Not part of the application: nothing in `lql/` imports NautilusTrader, and it is not installed in the project.

```bash
python3 -m venv /tmp/nt-venv && /tmp/nt-venv/bin/pip install "nautilus_trader==1.231.0"
/tmp/nt-venv/bin/python -I poc/nautilus/parity_poc.py "$PWD"                # daily bars only
/tmp/nt-venv/bin/python -I poc/nautilus/parity_poc.py "$PWD" --open-ticks   # bars + a trade at each session open
```

The two engines get the same input: DEMO-ETF-A synthetic bars rounded to cents, and an SMA 10/30 long/flat strategy trading 100 shares, with no costs. One engine is NautilusTrader, the other an independent reference written in about 25 lines. Results from 2026-10-22 are in `results-2026-10-22.json`:

| variant | fills | identical fills | max equity difference | max drawdown (reference / Nautilus) | runtime | peak RSS |
|---|---|---|---|---|---|---|
| daily bars only | 41 / 41 | no | 453 USD | -2.32% / -2.07% | 0.96 s | 503 MB |
| bars + trade at each open | 41 / 41 | **yes** | 0 | -2.32% / -2.32% | 0.90 s | 503 MB |

These two variants show a semantic difference, not a defect. With bar data alone, a market order decided on bar t and delayed by a 1 ns latency fills at the close of bar t+1, because all of a bar's OHLC points carry the bar's timestamp. The Local Quant Lab engine fills at the open of t+1. To model next-open fills in NautilusTrader, feed a trade (or quote) at each session open. With that, the fills, equity curve and drawdown match the reference exactly.

Decision, recorded in docs/audit/compatibility-matrix.md: **DEFER**. Parity is proven for daily bars. NautilusTrader would add value for intraday, order-book or multi-venue simulation, and later for paper adapters. The current daily engine needs none of that today. Adopting it now would cost:
- 936 MB installed;
- about 500 MB of memory per run, on an 8 GB Mac;
- numpy, pandas and pyarrow;
- LGPL obligations (wheel metadata: LGPL-3.0-or-later);
- a pending 2.x API change.
