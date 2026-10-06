#!/usr/bin/env python3
"""Perspective Engine task-graph CLI (stdlib only).

The graph in graph/graph.json is the single source of truth. Agents never edit
it by hand; they call this tool, which validates every transition, appends to
graph/ledger.jsonl and re-exports dashboard/state.js.

  python3 perspective-engine/tools/graph.py validate
  python3 perspective-engine/tools/graph.py ready            # nodes an agent may start now
  python3 perspective-engine/tools/graph.py human            # nodes waiting on the founder
  python3 perspective-engine/tools/graph.py brief F05        # minimal context packet for one node
  python3 perspective-engine/tools/graph.py start F05
  python3 perspective-engine/tools/graph.py done F05 "one-line summary"
  python3 perspective-engine/tools/graph.py block F05 "reason"
  python3 perspective-engine/tools/graph.py clear-gate V09 "founder approved batch 1"
  python3 perspective-engine/tools/graph.py export
"""
import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PE = ROOT / "perspective-engine"
GRAPH = PE / "graph" / "graph.json"
LEDGER = PE / "graph" / "ledger.jsonl"
STATE_JS = PE / "dashboard" / "state.js"
STATUSES = {"pending", "running", "done", "blocked", "awaiting_human"}


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load():
    return json.loads(GRAPH.read_text())


def save(g):
    GRAPH.write_text(json.dumps(g, indent=2) + "\n")


def index(g):
    return {n["id"]: n for n in g["nodes"]}


def log(event, node_id, note=""):
    with LEDGER.open("a") as f:
        f.write(json.dumps({"t": now(), "event": event, "node": node_id, "note": note}) + "\n")


def derived(n, idx):
    """Status as the dashboard sees it: a pending node whose deps are all done is ready.

    Gates never stop an agent from preparing the work. A gated node that an agent
    finishes moves to awaiting_human, and only the founder's clear-gate finishes it."""
    if n["status"] != "pending":
        return n["status"]
    return "ready" if all(idx[d]["status"] == "done" for d in n["deps"]) else "pending"


def validate(g):
    errs, idx = [], index(g)
    if len(idx) != len(g["nodes"]):
        errs.append("duplicate node ids")
    for n in g["nodes"]:
        if n["agent"] not in g["agents"]:
            errs.append(f"{n['id']}: unknown agent {n['agent']}")
        if n["status"] not in STATUSES:
            errs.append(f"{n['id']}: bad status {n['status']}")
        if not n["outputs"]:
            errs.append(f"{n['id']}: no outputs")
        for d in n["deps"]:
            if d not in idx:
                errs.append(f"{n['id']}: unknown dep {d}")
    seen, stack = set(), set()

    def visit(i):
        if i in stack:
            errs.append(f"cycle through {i}")
            return
        if i in seen:
            return
        stack.add(i)
        for d in idx[i]["deps"]:
            if d in idx:
                visit(d)
        stack.discard(i)
        seen.add(i)

    for i in idx:
        visit(i)
    return errs


def export(g):
    idx = index(g)
    ledger = []
    if LEDGER.exists():
        ledger = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()][-40:]
    nodes = [dict(n, view=derived(n, idx)) for n in g["nodes"]]
    state = {"generated": now(), "project": g["project"], "north_star": g["north_star"],
             "agents": g["agents"], "nodes": nodes, "ledger": ledger}
    STATE_JS.write_text("window.PE_STATE = " + json.dumps(state, indent=1) + ";\n")


def brief(n, g):
    """The only context an agent receives: its role, the node, and dep outputs (paths, not contents)."""
    idx = index(g)
    a = g["agents"][n["agent"]]
    inputs = [o for d in n["deps"] for o in idx[d]["outputs"]]
    return "\n".join([
        f"NODE {n['id']} - {n['title']}",
        f"AGENT {n['agent']} ({a['name']}): {a['role']}",
        f"ROLE CARD .claude/agents/pe-{n['agent']}.md",
        "READ ONLY THESE INPUTS: " + (", ".join(inputs) or "none"),
        "WRITE ONLY THESE OUTPUTS: " + ", ".join(n["outputs"]),
        "ACCEPTANCE: " + "; ".join(n["accept"]),
        f"TOKEN BUDGET: ~{n['budget_k']}k",
        f"GATE: {n['gate']['reason']}" if n.get("gate") else "GATE: none",
    ])


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    g = load()
    idx = index(g)
    if cmd == "validate":
        errs = validate(g)
        print("\n".join(errs) or f"ok: {len(idx)} nodes, {len(g['agents'])} agents, acyclic")
        return 1 if errs else 0
    if cmd in ("ready", "human", "status"):
        want = {"ready": {"ready"}, "human": {"awaiting_human"}}.get(cmd)
        for n in g["nodes"]:
            v = derived(n, idx)
            if want is None or v in want:
                extra = f"  [{n['gate']['reason']}]" if v == "awaiting_human" else ""
                print(f"{n['id']:4} {v:15} {n['agent']:12} {n['title']}{extra}")
        return 0
    if cmd == "export":
        export(g)
        print(f"wrote {STATE_JS.relative_to(ROOT)}")
        return 0
    if not args or args[0] not in idx:
        print(f"usage: {cmd} <NODE_ID> [note]")
        return 1
    n, note = idx[args[0]], " ".join(args[1:])
    if cmd == "brief":
        print(brief(n, g))
        return 0
    view = derived(n, idx)
    if cmd == "start":
        if view != "ready":
            print(f"refused: {n['id']} is {view}, not ready")
            return 1
        n["status"] = "running"
    elif cmd == "done":
        if n["status"] != "running":
            print(f"refused: {n['id']} is {n['status']}, start it first")
            return 1
        missing = [o for o in n["outputs"] if not (ROOT / o).exists() or (ROOT / o).stat().st_size == 0]
        if missing:
            print("refused: missing or empty outputs: " + ", ".join(missing))
            return 1
        gate = n.get("gate")
        n["status"] = "awaiting_human" if gate and not gate.get("cleared") else "done"
        if n["status"] == "awaiting_human":
            print(f"prepared; waiting on founder: {gate['reason']}")
    elif cmd == "block":
        n["status"] = "blocked"
    elif cmd == "unblock":
        n["status"] = "pending"
    elif cmd == "clear-gate":
        if not n.get("gate"):
            print(f"{n['id']} has no gate")
            return 1
        n["gate"]["cleared"] = note or "cleared"
        if n["status"] == "awaiting_human":
            n["status"] = "done"
    else:
        print(f"unknown command {cmd}")
        return 1
    save(g)
    log(cmd, n["id"], note)
    export(g)
    print(f"{n['id']} -> {cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
