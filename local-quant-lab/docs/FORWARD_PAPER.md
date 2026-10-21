# Forward paper log — Local Quant Lab

**Status: the mechanism is built and tested; forward paper trading has NOT been done.** No real market data has been processed and no real forward session exists. Everything in this repository so far ran on synthetic data. The runner is `lql/execution/forward.py`; the CLI is `python3 -m lql.cli forward`.

## What it is (and is not)
- **Is:** a repeatable, idempotent pass. Each call loads the data you point it at, processes every session newer than the last committed one, and appends to `forward_log.jsonl`. It uses the same fill model, sizing, risk engine and ledger as the rest of the lab. Orders are SIMULATED.
- **Is not:** a daemon, a data fetcher, or a broker connection. Something else (you, launchd, cron) must refresh the data and call it. If nobody calls it, nothing happens, and nothing warns you.

## Evidence classes (stored once per log directory; they cannot be mixed)
| Class | Meaning | Counts as forward evidence? |
|---|---|---|
| `SYNTHETIC_REPLAY` | Generated bars, all processed | No. Test and demo only |
| `SYNTHETIC_FORWARD` | Generated bars, forward mode | No (stale on creation, so it refuses to start) |
| `REAL_REPLAY` | Real historical bars replayed from the start | No. It is a backtest through the paper code path |
| `REAL_FORWARD` | Real snapshot; bars up to the first run are warm-up only; later bars are traded as they arrive | Yes, once the criteria below are met and a human reviews |

`FORWARD` mode refuses to start on data older than `max_data_age_seconds` (4 days) and never trades a session that has not closed yet (a bar dated today is deferred until 21:00 UTC; this is a conservative US close). Day 0 only warms up. The first traded session is the next one that arrives.

## What one session does
1. Validate each instrument's new bar against its previous bar. A bad bar (duplicate, out of order, invalid OHLC, non-positive price) locks that instrument out; the others carry on. A later valid bar clears the lockout.
2. Fill the previous session's orders at this session's open (sells first) with the configured spread, slippage and commission. An order that cannot fill (locked out, no bar for that instrument, stale data) is **cancelled, never carried across a gap**.
3. Mark to the latest known close and reconcile cash and positions against the fill journal. A mismatch blocks new risk (the risk engine rejects while the ledger is not reconciled).
4. Equal share of equity per instrument -> sizing -> deterministic risk check -> submit. Stale data (older than the limit), an engaged kill switch, or a limit breach produce `RISK_REJECTED` or no order; the strategy cannot override them.

## The log (`forward_log.jsonl`, append-only)
Every record has `rid` (deterministic key; a repeated rid is never written twice), `t` (wall-clock UTC), `kind`, `evidence_class`.

| kind | content |
|---|---|
| `init`, `run_start`, `run_end` | configuration and source info; pending and processed sessions; pass status |
| `signal` | session date, instrument, target weight, close, history length, strategy and version |
| `decision` | order id, side, qty, reference price, decision timestamp, status, risk reasons |
| `risk_rejection` | the same order with the rejection reasons |
| `fill` / `position_change` | price, costs, quantity; position before and after |
| `order_closed` | cancelled or rejected-at-fill orders with the reason |
| `equity` | cash, equity, positions value, positions, reconciliation flag |
| `data_event` | lockout, missing bar, calendar gap (> 5 days), stale data, deferred incomplete session |
| `kill_switch` | engage/release with operator and cancelled orders |
| `error` | any exception or data failure; the pass stops, the ledger stays consistent |

The log is rebuilt from the SQLite ledger (`ledger.db`, the source of truth). `run_state.json` holds the last pass summary. `python3 -m lql.cli forward report` prints sessions, fills, exits, rejections, data events, errors, reconciliation and the evidence statement.

## Crash recovery (tested at 8 interruption points)
An exception injected after order creation, after acceptance, after decisions, before logging, before commit, after commit, after fills and after marking leaves a consistent ledger. The next pass finishes half-made orders (`ACCEPTED` -> `SUBMITTED`; `CREATED` -> re-run the risk check), cannot duplicate an order or a fill (order ids come from idempotency keys), regenerates missing log records, and ends with the same equity, fills and log as an uninterrupted run. A torn last log line is ignored. A second concurrent pass is refused with `RunnerBusy`. A power cut mid-write is covered by SQLite transactions and per-batch fsync, not by an extra test.

## Scheduling on the Mac (you do this; nothing here installs anything)
`scripts/forward_daily.sh` (refuses to run unless `LQL_STOOQ_TERMS_OK=yes` is exported; needs a Stooq key if Stooq still requires one) refreshes the Stooq snapshots, keeps a dated copy in `data/snapshots/archive/`, and runs one pass. Example launchd job (save as `~/Library/LaunchAgents/com.localquantlab.forward.plist`, edit the path, then `launchctl load` it):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.localquantlab.forward</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>/ABSOLUTE/PATH/local-quant-lab/scripts/forward_daily.sh</string></array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/tmp/lql-forward.out</string>
  <key>StandardErrorPath</key><string>/tmp/lql-forward.err</string>
</dict></plist>
```
Local time on the Mac; 18:30 US Eastern is after the close in every season. A missed run is caught up by the next one (see limitations).

## Operational limitations (read before trusting any number)
- **A sleeping or off Mac skips runs.** Missed sessions are processed late. Anything older than 4 days relative to the run time is treated as stale: marked to market, but not traded, and its pending orders are cancelled. Gaps are visible as `stale_data` / `calendar_gap` events, not hidden.
- **Stooq is a free, unofficial end-of-day source that reportedly now needs an API key and has a daily quota.** It can publish late, miss days, revise history (the adjustment status is `unknown`) or change format. Each refresh overwrites the CSV, so past bars can change under the ledger. That is why the script archives every snapshot, and why a hash mismatch is a visible `DATA_ERROR`.
- **No holiday calendar.** A session exists if some instrument has a bar for that date. A real holiday looks like "no bar" and is simply skipped; a missing bar on a normal day looks the same. Only gaps above 5 calendar days are flagged.
- **Fills are modelled.** Next-open market fills with linear costs. No partial fills, no queue position, no auction, no dividends or corporate actions beyond what the (possibly adjusted) data embeds, no taxes.
- **Paper session rejects, the backtester shrinks.** If a gap up leaves too little cash at the open, the paper session rejects the order; the portfolio backtester buys what it can afford. The paper behaviour is the more conservative one. They are otherwise equivalent (tested on equity to six decimals when cash does not bind).
- **One strategy and equal shares per log.** Changing the strategy, the universe, the mode or the data kind of an existing log is refused; start a new directory.
- **Single machine, single operator.** No remote monitoring. You must read `forward report` and the `error` records. `scripts/forward_daily.sh` exits non-zero only on a crash, not on a `DATA_ERROR` summary: check `run_state.json`.

## Price adjustment and the provisional flag
If the data's split/dividend treatment is not verified (`docs/DATA_PROVENANCE.md`), the log records a `provisional_adjustment` data event and the report is marked provisional for good. A provisional log never meets the evidence criteria, whatever the session count. Verify first, then start a new log directory.

## When could this count as paper evidence?
Mechanical criteria (in `forward.py`, shown by `forward report`): at least **60 `REAL_FORWARD` sessions**, at least **10 completed exits**, no `error` records, ledger reconciled. Meeting them only makes a human review worthwhile. `alpha_status` stays `unproven` until that review, and even then paper results over a few months say little about future returns. Nothing in this build can authorise a real order.
