#!/bin/sh
# Run by the founder's scheduler (launchd or cron) once per US trading day, after the close. Never run by agents.
# 1. refresh the free Stooq end-of-day snapshots (research use only), keeping a dated copy of what was used;
# 2. run one idempotent forward-paper pass (SIMULATED; no broker exists).
# Safe to run repeatedly: a pass with nothing new changes nothing. A non-zero exit means look at the log.
set -eu
cd "$(dirname "$0")/.."
SYMS="${LQL_SYMBOLS:-SPY QQQ IWM TLT}"
python3 scripts/snapshot_stooq.py $SYMS
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "data/snapshots/archive/$STAMP"
cp data/snapshots/*.csv data/snapshots/*.manifest.json "data/snapshots/archive/$STAMP/"
python3 -m lql.cli forward run --source snapshot --mode FORWARD --instruments "$(echo $SYMS | tr ' ' ',')"
