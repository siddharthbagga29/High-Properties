---
name: experiment-triage
description: Decide whether a Local Quant Lab experiment report should be rejected, held, or advanced to paper testing.
version: 1.0.0
---
# Experiment triage

**Intended use:** read an experiment report produced by `lql` (net/gross/benchmark metrics, splits, cost and
parameter sensitivity, warnings, critic output) and recommend REJECT, HOLD or ADVANCE.

**Prohibited use:** this skill only recommends. It cannot change limits or settings, submit orders, or close tasks.
Only the deterministic critic and the supervisor record outcomes.

**Procedure**
1. Same-bar fills, metric mismatches or a failed look-ahead probe: REJECT (enforced in code).
2. Out-of-sample test window return at or below 0: REJECT.
3. Synthetic data: HOLD, whatever the numbers say.
4. Fewer than 30 round trips: HOLD (sample too small).
5. Fragile under cost or parameter sensitivity: HOLD.
6. Otherwise ADVANCE to paper testing, still labelled unproven/candidate.

**Evidence:** derived from the critic rules in `lql/orchestrator/critic.py` and the first DEMO-ETF-A run
(synthetic, 6 round trips), recorded in docs/RESEARCH_LEDGER.md.
**Rollback:** `python3 -m lql.cli skills rollback experiment-triage --by <name>`.
