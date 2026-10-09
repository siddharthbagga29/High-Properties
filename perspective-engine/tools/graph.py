#!/usr/bin/env python3
"""Perspective Engine task-graph CLI (stdlib only).

The graph in graph/graph.json is the single source of truth. Agents never edit
it by hand; they call this tool, which validates every transition, appends to
graph/ledger.jsonl, keeps a timestamped activity log per task, and re-exports
the state the dashboards read (dashboard/state.js, city/public/state.json).

  python3 perspective-engine/tools/graph.py validate
  python3 perspective-engine/tools/graph.py ready            # nodes an agent may start now
  python3 perspective-engine/tools/graph.py human            # nodes waiting on the founder
  python3 perspective-engine/tools/graph.py brief F05        # minimal context packet for one node
  python3 perspective-engine/tools/graph.py start F05
  python3 perspective-engine/tools/graph.py log F05 write "drafted section 2: kill criteria"
  python3 perspective-engine/tools/graph.py done F05 "one-line summary"
  python3 perspective-engine/tools/graph.py block F05 "reason"
  python3 perspective-engine/tools/graph.py clear-gate V09 "founder approved batch 1"
  python3 perspective-engine/tools/graph.py export
  python3 perspective-engine/tools/graph.py revenue add 1500 "Acme Corp" --evidence "invoice INV-001, bank ref 123" --founder
  python3 perspective-engine/tools/graph.py revenue list

Revenue is founder-only and needs an evidence reference: `revenue add` refuses
without --founder, without --evidence, or with an amount that is not above zero.

Every write takes an exclusive lock, so agents running in parallel cannot
corrupt the graph.
"""
import contextlib
import datetime
import fcntl
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PE = ROOT / "perspective-engine"
GRAPH = PE / "graph" / "graph.json"
LEDGER = PE / "graph" / "ledger.jsonl"
ACTIVITY = PE / "graph" / "activity"
LOCK = PE / "graph" / ".lock"
STATE_JS = PE / "dashboard" / "state.js"
CITY_JSON = PE / "city" / "public" / "state.json"
REVENUE = PE / "graph" / "revenue.jsonl"
AUDIT_JSON = PE / "graph" / "audit" / "scorecards.json"
STATUSES = {"pending", "running", "done", "blocked", "awaiting_human"}
LOG_KINDS = {"plan", "read", "search", "fetch", "write", "edit", "run", "check", "note", "blocked", "handoff"}
MAX_STATE_BYTES = 230_000  # the live dashboard stores state in one 256 KiB document


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextlib.contextmanager
def locked():
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open("w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def load():
    return json.loads(GRAPH.read_text())


def save(g):
    tmp = GRAPH.with_suffix(".tmp")
    tmp.write_text(json.dumps(g, indent=2) + "\n")
    tmp.replace(GRAPH)


def index(g):
    return {n["id"]: n for n in g["nodes"]}


def ledger_append(event, node_id, note=""):
    with LEDGER.open("a") as f:
        f.write(json.dumps({"t": now(), "event": event, "node": node_id, "note": note}) + "\n")


def activity_append(node_id, agent, kind, text, src="self", t=None, actor=None):
    ACTIVITY.mkdir(parents=True, exist_ok=True)
    rec = {"t": t or now(), "node": node_id, "agent": agent, "kind": kind, "text": text[:300], "src": src}
    if actor:
        rec["actor"] = actor
    with (ACTIVITY / f"{node_id}.jsonl").open("a") as f:
        f.write(json.dumps(rec) + "\n")


def activity_all():
    out = {}
    if not ACTIVITY.exists():
        return out
    for p in sorted(ACTIVITY.glob("*.jsonl")):
        rows = [json.loads(l) for l in p.read_text().splitlines() if l.strip()]
        seen, uniq = set(), []
        for r in sorted(rows, key=lambda r: r["t"]):
            k = (r["t"], r["kind"], r["text"])
            if k not in seen:
                seen.add(k)
                uniq.append(r)
        out[p.stem] = uniq
    return out


def dep_ok(dep, dependent):
    """A dependency is satisfied when it is done. A dependent that is itself
    founder-gated may also start from a dependency that is fully prepared and
    only waiting on the founder: it will be prepared, never finished, before
    the founder acts. Anything that needs real results waits for done."""
    if dep["status"] == "done":
        return True
    return dep["status"] == "awaiting_human" and bool(dependent.get("gate"))


def derived(n, idx):
    """Status as the dashboard sees it: a pending node whose deps are satisfied is ready."""
    if n["status"] != "pending":
        return n["status"]
    return "ready" if all(dep_ok(idx[d], n) for d in n["deps"]) else "pending"


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


def ledger_all():
    if not LEDGER.exists():
        return []
    return [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]


def revenue_all():
    """Founder-recorded revenue entries (graph/revenue.jsonl). Unparseable lines are skipped, never repaired."""
    if not REVENUE.exists():
        return []
    out = []
    for line in REVENUE.read_text().splitlines():
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def audit_state():
    """The auditor's scorecards (tools/audit.py writes graph/audit/scorecards.json), or None."""
    if not AUDIT_JSON.exists():
        return None
    try:
        return json.loads(AUDIT_JSON.read_text())
    except json.JSONDecodeError:
        return None


def size(doc):
    return len(json.dumps(doc, separators=(",", ":")))


def export(g):
    idx = index(g)
    ledger = ledger_all()
    nodes = [dict(n, view=derived(n, idx)) for n in g["nodes"]]
    state = {"generated": now(), "project": g["project"], "north_star": g["north_star"],
             "agents": g["agents"], "nodes": nodes, "ledger": ledger[-40:],
             "revenue": revenue_all(), "audit": audit_state()}
    STATE_JS.write_text("window.PE_STATE = " + json.dumps(state, indent=1) + ";\n")
    if CITY_JSON.parent.exists():
        act = activity_all()
        city = dict(state, ledger=ledger, excerpts={o: excerpt(o) for n in nodes for o in n["outputs"]}, activity=act)
        # Keep the live document under its size cap: trim the oldest activity first.
        # Revenue and audit are never trimmed.
        cap = 120
        while size(city) > MAX_STATE_BYTES and cap > 10:
            cap -= 10
            city["activity"] = {k: v[-cap:] for k, v in act.items()}
        # Only if activity at its floor is still not enough: the dashboard's ledger window, then no activity,
        # then shorter excerpts.
        if size(city) > MAX_STATE_BYTES:
            city["ledger"] = ledger[-40:]
        if size(city) > MAX_STATE_BYTES:
            city["activity"] = {}
        if size(city) > MAX_STATE_BYTES:
            city["excerpts"] = {k: (v[:160] + "…" if v and len(v) > 160 else v) for k, v in city["excerpts"].items()}
        CITY_JSON.write_text(json.dumps(city, separators=(",", ":")))


def revenue_cmd(args, g):
    """revenue add <amount_usd> <payer> --evidence <ref> --founder | revenue list"""
    usage = 'usage: revenue add <amount_usd> <payer> --evidence <ref> --founder | revenue list'
    if args[:1] == ["list"]:
        rows = revenue_all()
        if not rows:
            print("no revenue recorded")
            return 0
        for r in rows:
            amt = r.get("amountUsd")
            amt = f"${amt:,.2f}" if isinstance(amt, (int, float)) else repr(amt)
            print(f"{r.get('t')}  {amt}  {r.get('payer')}  evidence: {r.get('evidence')}  recorded by {r.get('recordedBy')}")
        total = sum(r["amountUsd"] for r in rows if isinstance(r.get("amountUsd"), (int, float)))
        print(f"{len(rows)} entries, ${total:,.2f} total, {len({r.get('payer') for r in rows})} payers")
        return 0
    if args[:1] != ["add"]:
        print(usage)
        return 1
    founder, evidence, pos, rest, i = False, None, [], args[1:], 0
    while i < len(rest):
        a = rest[i]
        if a == "--founder":
            founder = True
        elif a == "--evidence":
            evidence = rest[i + 1] if i + 1 < len(rest) else ""
            i += 1
        elif a.startswith("--evidence="):
            evidence = a.split("=", 1)[1]
        elif a.startswith("--"):
            print(f"refused: unknown option {a}")
            return 1
        else:
            pos.append(a)
        i += 1
    if not founder:
        print("refused: revenue is recorded only by the founder; pass --founder to attest that you are the founder")
        return 1
    if len(pos) != 2:
        print(usage)
        return 1
    try:
        amount = float(pos[0].replace(",", "").lstrip("$"))
    except ValueError:
        print(f"refused: amount {pos[0]!r} is not a number")
        return 1
    if amount != amount or amount in (float("inf"), float("-inf")) or amount <= 0:
        print(f"refused: amount must be a positive number of US dollars, got {pos[0]}")
        return 1
    payer = pos[1].strip()
    if not payer:
        print("refused: payer is empty")
        return 1
    if not (evidence or "").strip():
        print("refused: revenue needs --evidence <ref> (invoice, bank or payment-processor reference)")
        return 1
    entry = {"t": now(), "amountUsd": round(amount, 2), "payer": payer, "evidence": evidence.strip(), "recordedBy": "founder"}
    REVENUE.parent.mkdir(parents=True, exist_ok=True)
    with REVENUE.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    export(g)
    print(f"recorded ${entry['amountUsd']:,.2f} from {payer} (evidence: {entry['evidence']})")
    return 0


def excerpt(path, limit=520):
    """First summary paragraph of an output file, so the city can show what an agent produced."""
    f = ROOT / path
    if not f.exists() or f.suffix not in (".md", ".py", ".csv", ".html"):
        return None
    text = f.read_text(errors="ignore")
    if f.suffix == ".csv":
        rows = text.strip().splitlines()
        return f"{len(rows) - 1} rows. Columns: {rows[0]}" if rows else None
    if f.suffix in (".py", ".html"):
        return None
    m = re.search(r"^#+ *summary[^\n]*\n(.*?)(?=^#|\Z)", text, re.I | re.M | re.S)
    if m and m.group(1).strip():
        pick = m.group(1).strip()
    else:
        lead = re.search(r"\*\*summary[^*]*\*\*(.*?)(?=\n\n|\Z)", text, re.I | re.S)
        blocks = [b.strip() for b in text.split("\n\n") if b.strip() and not b.lstrip().startswith(("#", "|", "---", "```", "<!--"))]
        pick = lead.group(1) if lead else next((b for b in blocks if len(b) > 120), blocks[0] if blocks else "")
    pick = re.sub(r"^[-*] ", "", pick, flags=re.M)
    pick = " ".join(pick.replace("**", "").split())
    return pick[:limit] + ("…" if len(pick) > limit else "")


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
        f"LOG EVERY STEP: python3 perspective-engine/tools/graph.py log {n['id']} <{'|'.join(sorted(LOG_KINDS))}> \"what you did\"",
    ])


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    cmd, args = argv[0], argv[1:]
    with locked():
        return run(cmd, args)


def run(cmd, args):
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
        print(f"wrote {STATE_JS.relative_to(ROOT)} and {CITY_JSON.relative_to(ROOT)}")
        return 0
    if cmd == "revenue":
        return revenue_cmd(args, g)
    if not args or args[0] not in idx:
        print(f"usage: {cmd} <NODE_ID> [note]")
        return 1
    n = idx[args[0]]
    if cmd == "brief":
        print(brief(n, g))
        return 0
    if cmd == "log":
        # --verifier marks a step taken by the independent verifier, so the dashboard never credits it to the agent.
        actor = "verifier" if "--verifier" in args else None
        args = [a for a in args if a != "--verifier"]
        if len(args) < 3 or args[1] not in LOG_KINDS:
            print(f"usage: log <NODE_ID> <{'|'.join(sorted(LOG_KINDS))}> [--verifier] \"text\"")
            return 1
        activity_append(n["id"], n["agent"], args[1], " ".join(args[2:]), actor=actor)
        export(g)
        print(f"{n['id']} logged {args[1]}")
        return 0
    note = " ".join(args[1:])
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
    ledger_append(cmd, n["id"], note)
    activity_append(n["id"], n["agent"], {"start": "plan", "done": "handoff", "block": "blocked"}.get(cmd, "note"),
                    f"{cmd}{': ' + note if note else ''}", src="ledger")
    export(g)
    print(f"{n['id']} -> {cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
