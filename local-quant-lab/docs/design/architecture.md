# Console architecture

```
browser (web/, plain ES modules, no build, no dependencies)
  main.js ── shell, router (#hash), pulse loop, palette, dialogs, toasts, sound, prefs
  views/{overview,graph,data,research,paper,logs,system}.js ── load() → render()
  format.js, status.js, graph-model.js, charts.js, prefs.js, sound.js ── pure, unit-tested with node --test
        │  fetch (timeout 8–15 s; failures flip the connection state)
        ▼
lql/server.py (stdlib ThreadingHTTPServer, 127.0.0.1 only, Host + CSRF guards, 64 KB bodies, CSP 'self')
  GET  /api/overview /graph /data /data/series /research /forward /system /jobs /pulse   (read models)
  GET  /api/status /dashboard /experiments /experiment/<id>[.csv|.json] /events /tasks /paper (unchanged)
  POST /api/jobs {kind: recheck|backtest}   POST /api/jobs/cancel {id}
  POST /api/backtest /paper/step /paper/archive /kill /release                          (unchanged)
        │
        ├── lql/console.py   read models over existing state (no new computation, no writes, credentials as status only)
        ├── lql/jobs.py      JobRunner: 1 worker thread, queue ≤ 8, in-memory, audit events per transition
        └── lql/lab.py       existing facade (experiments, paper, kill switch, status; Hermes health cached 60 s)
                │
                ▼  state/: current_state.json (task graph), events.jsonl, experiments/, paper.db,
                   research/{prereg,results,holdout_registry.json}, forward/<log>/, data/snapshots/*.manifest.json
```

## Data flow
- **Pulse:** every 2.5 s while the tab is visible the client calls `/api/pulse?since=<n>`: server status, the last 12 jobs and the audit events after index `n`. New events or job changes re-load the current workspace and trigger toasts, sound cues and one-shot animations. A full reload of the current view also happens every 20 s. Nothing else polls.
- **Jobs:** the only long operations started from the UI. `recheck` runs a task's acceptance commands (`python3 -m unittest …` only, validated by regex) in a subprocess with the task's timeout, records passed/failed, wall time and child CPU time, and **never changes the task's status** (the task graph only lets the supervisor close a task). A failure emits `acceptance_regression`. `backtest` calls `Lab.experiment` (deterministic, cached). Queued jobs can be cancelled; a running recheck is terminated on cancel; a running backtest is reported as not cancellable.
- **What the console cannot do, by design:** start or spend a walk-forward study or the holdout, start or advance a forward log, change risk limits, import data, release the kill switch without a named person, or reach a broker. Those stay in the CLI or do not exist.

## Local-first and the two-machine target
- Everything runs on one machine with the Python standard library and a browser. No fonts, scripts, images or APIs are fetched from the network (tested: no `http(s)://` outside localhost in `web/`).
- Target topology (not configured here): MacBook Air M3 (8 GB) as the client and control room; an HP Envy as the host for Ollama/Hermes once its hardware is verified. The System workspace probes Hermes (`hermes --version`, cached) and Ollama (`127.0.0.1:11434/api/version`, 0.4 s timeout, cached 30 s) and reports "not found / not reachable" honestly. The server refuses to bind anything but localhost; reaching the HP should go over a private network/VPN with firewall rules, never a public port.

## Resource notes (8 GB MacBook Air)
- One job worker, bounded queue, one subprocess at a time.
- Graph and charts are SVG; no WebGL, no physics, no canvas loop. Measured layout + render of a 300-task synthetic graph: ~1 ms + 30–55 ms (see `verification.md`).
- Polling pauses when the tab is hidden; nothing animates while idle.
