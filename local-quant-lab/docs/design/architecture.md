# Console architecture

```
browser (web/, plain ES modules, no build; one vendored dependency: three.js r180, pinned, Overview only)
  main.js ── shell, router (#hash), pulse loop, palette, dialogs, toasts, sound, prefs
  views/{overview,graph,data,research,paper,logs,system}.js ── load() → render()
  scene/floor.js ── the 3D trading floor (WebGL): desks, bots, podium, brain, beams, streams, monitors
  scene/brain-worker.js ── Web Worker: builds the neuron cloud off the main thread (transferable buffers)
  format.js, status.js, graph-model.js, charts.js, prefs.js, sound.js,
  scene/{brain-geometry,bust-geometry,floor-model}.js ── pure, unit-tested with node --test
        │  fetch (timeout 8–15 s; failures flip the connection state)
        ▼
lql/server.py (stdlib ThreadingHTTPServer, 127.0.0.1 only, Host + CSRF guards, 64 KB bodies, CSP 'self')
  GET  /api/overview /graph /data /data/series /research /forward /system /jobs /pulse   (read models)
  GET  /api/status /dashboard /experiments /experiment/<id>[.csv|.json] /events /tasks /paper (unchanged)
  POST /api/jobs {kind: recheck|backtest}   POST /api/jobs/cancel {id}
  POST /api/backtest /paper/step /paper/archive /kill /release                          (unchanged)
        │
        ├── lql/console.py   read models over existing state (no new computation, no writes, credentials as status only)
        ├── lql/jobs.py      JobRunner: 1 worker thread, queue ≤ 8, every job persisted in state/jobs/, audit events per transition
        └── lql/lab.py       existing facade (experiments, paper, kill switch, status; Hermes health cached 60 s)
                │
                ▼  state/: current_state.json (task graph), events.jsonl, experiments/, paper.db,
                   research/{prereg,results,holdout_registry.json}, forward/<log>/, data/snapshots/*.manifest.json
```

## Data flow
- **Pulse:** every 2.5 s while the tab is visible the client calls `/api/pulse?since=<n>`: server status, the last 12 jobs and the audit events after index `n`. New events or job changes re-load the current workspace and trigger toasts, sound cues and one-shot animations. A full reload of the current view also happens every 20 s. Nothing else polls.
- **Jobs:** the only long operations started from the UI. `recheck` runs a task's acceptance commands (`python3 -m unittest …` only, validated by regex) in a subprocess with the task's timeout, records passed/failed, wall time and child CPU time, and **never changes the task's status** (the task graph only lets the supervisor close a task). A failure emits `acceptance_regression`. `backtest` calls `Lab.experiment` (deterministic, cached) and reports its real stages. `montecarlo` runs a seeded block bootstrap of an experiment (`lql/research/montecarlo.py`). Queued jobs can be cancelled; a running recheck is terminated on cancel; a running Monte Carlo stops at the next 100 paths and saves nothing; a running backtest is reported as not cancellable. Every job is persisted (`state/jobs/<id>.json`); on restart a running job becomes `failed` with `interrupted: true` and a never-started one is re-queued. `/api/health` reports the web server, API, worker (heartbeat), queue, research engine, data and model providers separately (D-018).
- **What the console cannot do, by design:** start or spend a walk-forward study or the holdout, start or advance a forward log, change risk limits, import data, release the kill switch without a named person, or reach a broker. Those stay in the CLI or do not exist.

## The trading floor (Overview)
- **Data in:** `/api/overview` returns `desks` (one per bot: task, detail, three metrics, result, tone, active/queued job) and `brain` (per region: evidence units, `k`, share, `formed = 1 - exp(-units/k)`, recent growth events, formula and meaning). Both are read models in `lql/console.py` over the task file, experiments, the research registry, the paper ledger, datasets and the audit log. Nothing on the floor is computed from anything else.
- **Jobs to desks:** a `recheck` goes to the desk of the task's owner, and a `backtest` goes to research (`deskForJob`, mirrored by the server's `desks`). While a job runs, the supervisor's dispatch beam flows to that desk, the bot types, and the desk's region of the brain glows. When it ends, a beam rises from the desk (green for done, rose for failed). If the brain model grew, a stream of particles flies from the desk into the region, and the new neurons flash as they form.
- **Brain:** one `THREE.Points` with a custom shader. Each point carries `[region, order, kind, rnd]`, and a neuron is lit when `order < formed[region]`, so a region grows outward from its seed. The cloud is deterministic for a given (count, seed) and is built in a worker: 150k neurons in about 120 to 150 ms in the container. Quality presets: low 150k, medium 400k, high 1M, ultra 2M. "auto" picks from the device's cores and memory, and phones get low.
- **Supervisor hologram:** `bust-geometry.js` samples the hull of the City's bust shapes (cranium, jaw, neck, trapezius, deltoids, chest) as points with normals. The shader rim-lights them and adds scanlines (ambient). The brain sits inside the cranium (`BRAIN_C`, `BRAIN_S`). Face features are separate point kinds, drawn only when `faceStage(EDGE formed)` reaches their stage. `/api/overview` → `brain.stage` gives the stage ladder the HUD shows.
- **Lifecycle:** the WebGL canvas is created once and survives the 2.5 s polling. Each render patches only the HTML sections. Monitor textures are redrawn only when their data changes. The render loop pauses when the Overview or the tab is hidden. Under reduced motion it renders only on change. If WebGL or the module fails to load, the flat SVG dial is shown instead (tested).

## Local-first and the two-machine target
- Everything runs on one machine with the Python standard library and a browser. No fonts, scripts, images or APIs are fetched from the network (tested: no `http(s)://` outside localhost in `web/`; the vendored three.js files are pinned by SHA-256 and contain only an XML namespace URI).
- Target topology (not configured here): MacBook Air M3 (8 GB) as the client and control room; an HP Envy as the host for Ollama/Hermes once its hardware is verified. The System workspace probes Hermes (`hermes --version`, cached) and Ollama (`127.0.0.1:11434/api/version`, 0.4 s timeout, cached 30 s) and reports "not found / not reachable" honestly. The server refuses to bind anything but localhost; reaching the HP should go over a private network/VPN with firewall rules, never a public port.

## Resource notes (8 GB MacBook Air)
- One job worker, bounded queue, one subprocess at a time.
- Graph and charts are SVG. Measured layout + render of a 300-task synthetic graph: ~1 ms + 30–55 ms (see `verification.md`).
- The Overview's floor is the only WebGL and the only continuous render loop. It stops when you leave the Overview or hide the tab. Its cost scales with the "Neurons" setting. Mac frame rates have not been measured yet. The container's software renderer gives 2 to 4 fps, which says nothing about a GPU.
- Polling pauses when the tab is hidden; nothing animates while idle.
