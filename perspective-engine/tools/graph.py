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
  python3 perspective-engine/tools/graph.py authorize clear-gate V09 "founder approved batch 1"
  python3 perspective-engine/tools/graph.py clear-gate V09 "founder approved batch 1" --sig request.txt.sig
  python3 perspective-engine/tools/graph.py founder-key "ssh-ed25519 AAAA... founder@mac"

Revenue is founder-only and needs an evidence reference: `revenue add` refuses
without --founder, without --evidence, or with an amount that is not above zero.

Founder actions (revenue add, clear-gate, unblock) are signed once the founder
registers an SSH public key with `founder-key`: `authorize` prints the exact
request, the founder signs it on their own machine with
`ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n pe-founder request.txt`, and the
action runs only if `ssh-keygen -Y verify` accepts that signature for that
exact action at the current point in the record (so it cannot be replayed).
The private key never leaves the founder's machine, so no agent can produce a
signature. Before a key is registered these actions are recorded as
"attested", not "signed", and the auditor reports them.

Every write takes an exclusive lock, so agents running in parallel cannot
corrupt the graph.
"""
import contextlib
import datetime
import fcntl
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

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
SIGNERS = PE / "graph" / "founder.allowed_signers"
FOUNDER_AUTH = PE / "graph" / "founder-auth.jsonl"
NAMESPACE = "pe-founder"
STATUSES = {"pending", "running", "done", "blocked", "awaiting_human"}
LOG_KINDS = {"plan", "read", "search", "fetch", "write", "edit", "run", "check", "note", "blocked", "handoff"}
LOG_TEXT_MAX = 2000  # one activity row; longer text is cut with a warning, never silently
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


def ledger_append(event, node_id, note="", auth=None):
    row = {"t": now(), "event": event, "node": node_id, "note": note}
    if auth:
        row["auth"] = auth
    with LEDGER.open("a") as f:
        f.write(json.dumps(row) + "\n")


# ---------- founder authorization (signed with the founder's SSH key) ----------

def lines_in(path):
    if not path.exists():
        return 0
    with path.open() as f:
        return sum(1 for _ in f)


def auth_message(action, fields):
    """The exact text the founder signs. The sequence ties it to this point in the record, so it cannot be replayed."""
    seq = lines_in(LEDGER) + lines_in(REVENUE)
    body = [f"pe-founder-action v1", f"action: {action}"] + [f"{k}: {v}" for k, v in fields] + [f"sequence: {seq}"]
    return "\n".join(body) + "\n"


def ssh_verify(msg, sig_text, signers=None):
    """(ok, detail). Fails closed when ssh-keygen is missing."""
    exe = shutil.which("ssh-keygen")
    if not exe:
        return False, "ssh-keygen not found, so the signature cannot be checked"
    with tempfile.TemporaryDirectory() as d:
        sig = pathlib.Path(d) / "request.sig"
        sig.write_text(sig_text)
        r = subprocess.run([exe, "-Y", "verify", "-f", str(signers or SIGNERS), "-I", "founder", "-n", NAMESPACE, "-s", str(sig)],
                           input=msg.encode(), capture_output=True, timeout=20)
    return r.returncode == 0, (r.stdout + r.stderr).decode(errors="replace").strip()[:200]


def key_fingerprint(pubkey):
    exe = shutil.which("ssh-keygen")
    if not exe:
        return None
    with tempfile.TemporaryDirectory() as d:
        k = pathlib.Path(d) / "k.pub"
        k.write_text(pubkey + "\n")
        r = subprocess.run([exe, "-l", "-f", str(k)], capture_output=True, timeout=20)
    return r.stdout.decode().split()[1] if r.returncode == 0 and r.stdout else None


def pop_sig(args):
    """Removes --sig <file> from args; returns (args, path or None)."""
    out, sig, i = [], None, 0
    while i < len(args):
        if args[i] == "--sig":
            sig = args[i + 1] if i + 1 < len(args) else ""
            i += 2
            continue
        if args[i].startswith("--sig="):
            sig = args[i].split("=", 1)[1]
        else:
            out.append(args[i])
        i += 1
    return out, sig


def founder_auth(action, fields, sig_path):
    """None means refused. Otherwise the auth label to record ('signed' or 'attested')."""
    msg = auth_message(action, fields)
    if not SIGNERS.exists():
        print("warning: no founder key is registered (graph.py founder-key), so this is recorded as attested, not signed")
        return "attested"
    if not sig_path:
        print("refused: a founder key is registered, so this action needs the founder's signature.")
        print("Sign this exact request on the founder's machine (save it as request.txt):")
        print(msg + f"  ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n {NAMESPACE} request.txt\nthen re-run with --sig request.txt.sig")
        return None
    try:
        sig = pathlib.Path(sig_path).read_text()
    except OSError as e:
        print(f"refused: cannot read signature file: {e}")
        return None
    ok, why = ssh_verify(msg, sig)
    if not ok:
        print(f"refused: the signature does not verify for this exact action at this point in the record ({why})")
        return None
    with FOUNDER_AUTH.open("a") as f:
        f.write(json.dumps({"t": now(), "action": action, "msg": msg, "sig": sig}) + "\n")
    return "signed"


VERDICT_FAIL = re.compile(r"\bFAILS?\b|\bGAP\b")  # the verifier's verdict words (case-sensitive)


def verifier_cleared(node_id):
    """(ok, reason). done needs an independent verifier row (graph.py log --verifier) recorded after the builder's
    last write or edit, and that row must not report FAIL or GAP."""
    path = ACTIVITY / f"{node_id}.jsonl"
    rows = []
    if path.exists():
        with path.open() as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    last_change = max((str(r.get("t")) for r in rows if r.get("actor") != "verifier" and r.get("src") != "ledger"
                       and r.get("kind") in ("write", "edit")), default="")
    checks = [r for r in rows if r.get("actor") == "verifier" and str(r.get("t")) >= last_change]
    if not checks:
        return False, ("no independent verifier check is recorded since the last change; the verifier runs "
                       f'graph.py log {node_id} check --verifier "<criteria and verdicts>" first')
    if VERDICT_FAIL.search(str(checks[-1].get("text", ""))):
        return False, "the latest verifier check reports FAIL or GAP; fix the gaps and have the verifier check again"
    return True, ""


def founder_key_cmd(args):
    args, sig_path = pop_sig(args)
    key = " ".join(args).strip()
    parts = key.split()
    if len(parts) < 2 or parts[0] not in ("ssh-ed25519", "ecdsa-sha2-nistp256", "sk-ssh-ed25519@openssh.com"):
        print('usage: founder-key "ssh-ed25519 AAAA... comment" [--sig file]  (an ed25519 or ECDSA public key)')
        return 1
    fp = key_fingerprint(" ".join(parts[:2]))
    if not fp:
        print("refused: not a valid public key (or ssh-keygen is missing)")
        return 1
    if SIGNERS.exists():
        # Replacing the key needs the current key's signature, so an agent cannot swap in its own.
        auth = founder_auth("founder-key", [("key", " ".join(parts[:2]))], sig_path)
        if auth != "signed":
            return 1
    SIGNERS.write_text(f'founder namespaces="{NAMESPACE}" {" ".join(parts[:2])}\n')
    ledger_append("founder-key", "D01", f"founder signing key registered: {fp}. Check it on your Mac with: ssh-keygen -lf ~/.ssh/id_ed25519.pub")
    print(f"registered founder key {fp}")
    return 0


def authorize_cmd(args, g):
    """Prints the exact request the founder signs for clear-gate, unblock or revenue add."""
    if args[:1] in (["clear-gate"], ["unblock"]) and len(args) >= 2 and args[1] in index(g):
        print(auth_message(args[0], [("node", args[1]), ("note", " ".join(args[2:]))]), end="")
        return 0
    if args[:2] == ["revenue", "add"]:
        parsed = parse_revenue(args[2:])
        if parsed is None:
            return 1
        amount, payer, evidence, _ = parsed
        print(auth_message("revenue add", revenue_fields(amount, payer, evidence)), end="")
        return 0
    print('usage: authorize clear-gate|unblock <NODE_ID> "note" | authorize revenue add <usd> <payer> --evidence <ref>')
    return 1


def activity_append(node_id, agent, kind, text, src="self", t=None, actor=None):
    ACTIVITY.mkdir(parents=True, exist_ok=True)
    if len(text) > LOG_TEXT_MAX:
        print(f"warning: activity text is {len(text)} characters; stored the first {LOG_TEXT_MAX}. Log the rest as a second row.")
    rec = {"t": t or now(), "node": node_id, "agent": agent, "kind": kind, "text": text[:LOG_TEXT_MAX], "src": src}
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
    rest, sig_path = pop_sig(args[1:])
    parsed = parse_revenue(rest, need_founder=True)
    if parsed is None:
        return 1
    amount, payer, evidence, _ = parsed
    auth = founder_auth("revenue add", revenue_fields(amount, payer, evidence), sig_path)
    if auth is None:
        return 1
    entry = {"t": now(), "amountUsd": round(amount, 2), "payer": payer, "evidence": evidence, "recordedBy": "founder", "auth": auth}
    REVENUE.parent.mkdir(parents=True, exist_ok=True)
    with REVENUE.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    export(g)
    print(f"recorded ${entry['amountUsd']:,.2f} from {payer} (evidence: {entry['evidence']}; {auth})")
    return 0


def revenue_fields(amount, payer, evidence):
    return [("amountUsd", f"{round(amount, 2):.2f}"), ("payer", payer), ("evidence", evidence)]


def parse_revenue(rest, need_founder=False):
    """(amount, payer, evidence, founder) or None after printing why."""
    usage = 'usage: revenue add <amount_usd> <payer> --evidence <ref> --founder'
    founder, evidence, pos, i = False, None, [], 0
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
            return None
        else:
            pos.append(a)
        i += 1
    if need_founder and not founder:
        print("refused: revenue is recorded only by the founder; pass --founder to attest that you are the founder")
        return None
    if len(pos) != 2:
        print(usage)
        return None
    try:
        amount = float(pos[0].replace(",", "").lstrip("$"))
    except ValueError:
        print(f"refused: amount {pos[0]!r} is not a number")
        return None
    if amount != amount or amount in (float("inf"), float("-inf")) or amount <= 0:
        print(f"refused: amount must be a positive number of US dollars, got {pos[0]}")
        return None
    payer = pos[1].strip()
    if not payer:
        print("refused: payer is empty")
        return None
    if not (evidence or "").strip():
        print("refused: revenue needs --evidence <ref> (invoice, bank or payment-processor reference)")
        return None
    return amount, payer, evidence.strip(), founder


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
    if cmd == "authorize":
        return authorize_cmd(args, g)
    if cmd == "founder-key":
        return founder_key_cmd(args)
    sig_path = None
    if cmd in ("clear-gate", "unblock"):
        args, sig_path = pop_sig(args)
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
    auth = None
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
        ok, why = verifier_cleared(n["id"])
        if not ok:
            print(f"refused: {why}")
            return 1
        gate = n.get("gate")
        n["status"] = "awaiting_human" if gate and not gate.get("cleared") else "done"
        if n["status"] == "awaiting_human":
            print(f"prepared; waiting on founder: {gate['reason']}")
    elif cmd == "block":
        if n["status"] not in ("pending", "running"):
            print(f"refused: {n['id']} is {n['status']}; only pending or running tasks can be blocked")
            return 1
        n["status"] = "blocked"
    elif cmd == "unblock":
        if n["status"] != "blocked":
            print(f"refused: {n['id']} is {n['status']}, not blocked")
            return 1
        auth = founder_auth("unblock", [("node", n["id"]), ("note", note)], sig_path)
        if auth is None:
            return 1
        n["status"] = "pending"
    elif cmd == "clear-gate":
        if not n.get("gate"):
            print(f"{n['id']} has no gate")
            return 1
        auth = founder_auth("clear-gate", [("node", n["id"]), ("note", note)], sig_path)
        if auth is None:
            return 1
        n["gate"]["cleared"] = note or "cleared"
        if n["status"] == "awaiting_human":
            n["status"] = "done"
    else:
        print(f"unknown command {cmd}")
        return 1
    save(g)
    ledger_append(cmd, n["id"], note, auth=auth)
    activity_append(n["id"], n["agent"], {"start": "plan", "done": "handoff", "block": "blocked"}.get(cmd, "note"),
                    f"{cmd}{': ' + note if note else ''}", src="ledger")
    export(g)
    print(f"{n['id']} -> {cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
