# Research Ledger — Local Quant Lab

**Rule:** every trial is recorded, failed ones included. The machine log is `state/research_runs.jsonl`, appended by `Lab.experiment`. Full reports are in `state/experiments/<id>.json`; they are git-ignored and can be regenerated deterministically.

No result below is a market claim. All data so far is **synthetic**.

## H-001 · SMA trend filter (sma_trend v1.0.0, fast 50 / slow 200)
- **Idea and rationale:** time-series momentum, i.e. trend persistence in liquid ETFs (see `project-brief/RESEARCH_REFERENCES.md`). It is a simple, interpretable rule used to exercise the full pipeline, not a claimed edge.
- **Experiment configuration:**
  - Signal at close t; market fill at open t+1.
  - Costs: half-spread 2 bps, slippage 3 bps, commission $0.005 per share with a $1 minimum.
  - Sizing capped by the risk limits (D-008).
  - $100k start.
  - Splits: 60/20/20 train/validation/test. Parameters are fixed, so the splits are evaluation windows only.
  - Parameter grid on train+validation only.

| Run (2026-10-21) | Data | Net return | Sharpe | Max DD | Round trips | Benchmark (capped B&H) | Critic | alpha_status | result_hash |
|---|---|---|---|---|---|---|---|---|---|
| 78bf2b7c3a7fbb8f | DEMO-ETF-A synthetic | +6.78% | 0.43 | −4.97% | 6 | −24.6% | NOT_PROVEN | unproven | f87c0109e31a78d0 |
| 8057df7ded761669 | DEMO-ETF-B synthetic | +4.95% | 0.24 | −5.90% | 10 | −23.2% | NOT_PROVEN | unproven | b6195e7f4d0fc6be |

- **Critique:**
  - The data is synthetic.
  - There are 6 and 10 round trips, far below 30.
  - On DEMO-ETF-B, neighbouring parameters disagree on the sign of Sharpe (FRAGILE), and the strategy held **no position in the test window**, so it is untested out of sample.
  - "Beating" a falling synthetic series by staying in cash is not evidence of anything.
- **Decision:** keep the strategy as a pipeline baseline. No promotion.
- **Next falsification step:** on real snapshot data (SPY, QQQ, IWM, TLT; see DATA_PROVENANCE):
  - Run the same fixed 50/200 rule with no re-tuning.
  - Reject if the test-window return is ≤ 0, if it is FRAGILE under 2× costs, or if there are fewer than 30 round trips across the four instruments combined.

## H-002 · Volatility-scaled trend (vol_scaled_trend v1.0.0) inside a pre-registered walk-forward
- **Idea and rationale:** trend filter plus volatility targeting should cut drawdowns versus buy-and-hold by shrinking exposure when volatility rises. Assumes volatility clusters and trends persist; breaks on whipsaws and gaps.
- **Study configuration (frozen before running; spec hash `fcc75a7c47052167`):** 12 candidates (6 `sma_trend` fast 20/50 x slow 100/150/200, 6 `vol_scaled_trend` slow 100/150/200 x target vol 10/15%), rolling 504-bar train / 126-bar test / 126 step, 250-bar warm-up, 20% holdout, in-sample net Sharpe selection with at least 3 in-sample exits, equal-share buy-and-hold benchmark, 2x-cost stress, 1000 block-bootstrap draws. Universe: DEMO-ETF-A, DEMO-ETF-B (1800 synthetic days).
- **Result (synthetic data, 5 folds, 60 candidate evaluations; command: `python3 -m lql.cli research run --days 1800`):** NOT_PROVEN. Out-of-sample 630 days: return +4.6%, Sharpe 0.36 (95% interval -1.07 to +1.82), max drawdown -10.2%, 17 exits, average exposure 20%, annual turnover 3.5x, costs $519; benchmark return -9.3%, Sharpe -0.29, drawdown -23.8%. 2x-cost Sharpe 0.32. Selection stability 0.4 (modal candidate `sma_trend` 20/200). Mean in-sample Sharpe of the selected candidates was -0.18.
- **Failed checks:** Sharpe interval includes zero; data is synthetic; holdout not evaluated (deliberately left unspent).
- **Critique:** the series are generated, so "beating" a falling benchmark by sitting in cash (20% average exposure) says nothing. The selected candidate was different at every fold boundary, which is itself a warning.
- **Decision:** none. No promotion. The holdout stays unspent; for real data run the study on the Mac with a new name (see MAC_NEXT_STEPS.md).
- **Next falsification step:** real SPY/QQQ/IWM/TLT snapshots, frozen spec, then exactly one holdout evaluation.
