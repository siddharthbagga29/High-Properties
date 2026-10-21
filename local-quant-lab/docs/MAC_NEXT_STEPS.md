# Next steps on your Mac — exact commands

Nothing below was run in the cloud container; it needs your machine, your network, or your decision. Do them in order. Everything is free. No account, API key or subscription is involved.

## 0. Get the code and prove the baseline
```
git clone https://github.com/siddharthbagga29/High-Properties.git   # or: git pull
cd High-Properties && git checkout claude/nice-fermat-510prv
cd local-quant-lab
python3 --version                         # needs 3.11 or newer
python3 -m unittest discover -s tests -t .   # expect: OK (the count is in docs/BUILD_STATE.md)
python3 scripts/verify.py                 # expect M0-M10 done_verified, H1 needs_human
```
If a test fails on macOS, stop and report the output: the code has only been run on Linux.

## 1. Hermes (optional layer; the lab works without it)
Follow `docs/HERMES_INTEGRATION.md` steps 1 to 8 exactly. The short version:
```
python3 scripts/hermes_check.py                      # records chip, RAM, disk, uv, Ollama, Hermes in state/hermes_check.json
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash     # read the script first if you prefer
hermes model                                         # choose Local models; confirm the context is >= 64K
hermes memory status
python3 scripts/hermes_check.py --memory-roundtrip   # writes a nonce in session 1, recalls it in session 2
python3 -m lql.cli hermes                            # "source" should read hermes, not the fallback
```
Decision for you: do not add Nous Portal or any hosted key. If no local model is fast enough, leave Hermes off. Then commit `state/hermes_check.json` and mark H1 done only if the round trip really recalled the nonce.

## 2. Real daily data (free, research use only)
```
python3 scripts/snapshot_stooq.py SPY QQQ IWM TLT
```
Read the printed quality summary for each symbol (rows, first/last date, `tradable`, issue counts). If any symbol says `tradable=False` or the fetch failed, do not continue: send me the output. Stooq's adjustment status is recorded as `unknown`; treat dividend and split effects as unresolved. Commit `data/snapshots/` only if you are comfortable with Stooq's terms for your use (the files are CSV plus a manifest with a SHA-256).

## 3. Walk-forward on real data (spend the holdout once)
Pick a common start so every ETF exists (TLT starts in 2002; for example 2005-01-03). Choose the name now; the spec cannot change afterwards without a new name and a new hash.
```
python3 -m lql.cli research run --source snapshot --instruments SPY,QQQ,IWM,TLT --start 2005-01-03 --name wf-real-1
git add state/research/prereg state/research/runs.jsonl && git commit -m "Pre-registration wf-real-1"   # audit trail, before reading the verdict
```
Read the verdict, `checks` and `reasons`. If it is INSUFFICIENT, SUSPICIOUS or REJECTED, stop: that is the answer, and the holdout stays unspent. Only if it is NOT_PROVEN and you still want the final test:
```
python3 -m lql.cli research holdout --source snapshot --instruments SPY,QQQ,IWM,TLT --start 2005-01-03 --name wf-real-1 --spec <spec_hash>
git add state/research/holdout_registry.json && git commit -m "Holdout spent for wf-real-1"
```
This can be run once per holdout data. CANDIDATE means "survived every pre-registered check, still a hypothesis". It does not mean profitable and it does not unlock any order. Do not rerun with a different name on the same data hoping for a better result: the registry will flag it as contaminated.

## 4. Start the forward paper log (the only route to paper evidence)
```
python3 -m lql.cli forward run --source snapshot --mode FORWARD --instruments SPY,QQQ,IWM,TLT   # day 0: warm-up only
python3 -m lql.cli forward report --source snapshot --mode FORWARD --instruments SPY,QQQ,IWM,TLT
```
Then schedule `scripts/forward_daily.sh` (launchd example in `docs/FORWARD_PAPER.md`). Check `state/forward/snapshot-forward/run_state.json` and the `error` records at least weekly. The log becomes reviewable after 60 sessions and 10 exits (about three months at least); until then `forward report` says so.
Choose the strategy and parameters for this log before starting (default `sma_trend` 50/200). They cannot be changed in an existing log.

## 5. What you should decide, and what I will not do
- Whether Stooq's terms suit you; whether to keep snapshots in git.
- Whether to ever consider a paper broker: not built, not approved, needs the checklist in `docs/HERMES_INTEGRATION.md` "Future".
- I will not enable live trading, add a broker adapter, add paid services, or lower a risk limit. Limits only get stricter through `config.tighten` or by your own edit of `config/settings.json`.
