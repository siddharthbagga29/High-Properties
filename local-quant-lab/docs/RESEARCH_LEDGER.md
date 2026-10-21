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
