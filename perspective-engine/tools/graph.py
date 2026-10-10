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
  python3 perspective-engine/tools/graph.py reopen F05 "rework after audit finding AF-x"
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
registers an SSH public key with `founder-key`. The key is pinned in the ledger
(the founder-key event carries the full public key), never in a file an agent
could edit. `authorize` prints the exact request: one JSON line naming the
action, its fields and a hash of the record at that moment. The founder signs
it on their own machine with
`ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n pe-founder request.txt`, and the
action runs only if `ssh-keygen -Y verify` accepts that signature against the
pinned key. A signature cannot be replayed, moved to another action or reused
on another copy of the record. A second key can replace the first only with
the first key's signature. The first registration is trust on first use: the
founder confirms the fingerprint. Before any key is registered these actions
are recorded as "attested", not "signed", and the auditor reports them.

`done` needs an independent verifier check: `log <ID> check --verifier
"... VERDICT: PASS"` after the builder's last change, with the outputs
unchanged since that check (their hashes are recorded with it).

Every write takes an exclusive lock, so agents running in parallel cannot
corrupt the graph.
"""
import contextlib
import datetime
import fcntl
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

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


def ledger_append(event, node_id, note="", auth=None, **extra):
    row = {"t": now(), "event": event, "node": node_id, "note": note}
    if auth:
        row["auth"] = auth
    row.update({k: v for k, v in extra.items() if v is not None})
    with LEDGER.open("a") as f:
        f.write(json.dumps(row) + "\n")


# ---------- founder authorization (signed with the founder's SSH key) ----------

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
KEY_TYPES = ("ssh-ed25519", "ecdsa-sha2-nistp256", "sk-ssh-ed25519@openssh.com")


def jsonl(path):
    rows = []
    if path.exists():
        with path.open() as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return rows


def record_hash():
    """sha256 over the ledger and the revenue file: the exact point in this record a signature is bound to."""
    h = hashlib.sha256()
    for p in (LEDGER, REVENUE):
        h.update(p.read_bytes() if p.exists() else b"")
        h.update(b"\0")
    return h.hexdigest()


def auth_message(action, fields):
    """The exact text the founder signs: one JSON line, so no field can smuggle in another field or a fake action."""
    body = json.dumps({"action": action, "fields": fields, "record": record_hash()}, sort_keys=True, ensure_ascii=True,
                      separators=(",", ":"))
    return f"pe-founder-action v2\n{body}\n"


def msg_ref(msg):
    return hashlib.sha256(msg.encode()).hexdigest()


def ledger_had_key_in_git():
    """True if any committed version of the ledger ever added a founder-key event (git pickaxe). Deleting the line
    from the working ledger therefore cannot make the record look as if no key was ever registered."""
    try:
        rel = str(LEDGER.relative_to(ROOT))
        r = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H", "-S", '"event": "founder-key"', "--", rel],
                           capture_output=True, text=True, timeout=30)
    except (OSError, ValueError, subprocess.SubprocessError):
        return False
    return r.returncode == 0 and bool(r.stdout.strip())


def key_ever_registered():
    return any(e.get("event") == "founder-key" for e in jsonl(LEDGER)) or ledger_had_key_in_git()


def row_in_force(r, keys):
    """The (t, key, fp) that was in force when founder-auth row r was made, by its fingerprint and time, or None."""
    for i, (t, key, fp) in enumerate(keys):
        nxt = keys[i + 1][0] if i + 1 < len(keys) else None
        if r.get("keyFp") == fp and str(r.get("t")) >= t and (nxt is None or str(r.get("t")) <= nxt):
            return t, key, fp
    return None


def auth_row_valid(r, keys):
    """A founder-auth row is valid when its message hashes to its ref, its JSON body repeats its action and fields,
    and its signature verifies against the key in force when it was made."""
    msg = str(r.get("msg", ""))
    if msg_ref(msg) != r.get("ref"):
        return False
    try:
        body = json.loads(msg.split("\n", 1)[1])
    except (IndexError, json.JSONDecodeError):
        return False
    if body.get("action") != r.get("action") or body.get("fields") != r.get("fields"):
        return False
    k = row_in_force(r, keys)
    return bool(k) and ssh_verify(msg, str(r.get("sig", "")), k[1])[0]


def key_chain():
    """(keys, problems). keys: [(t, key, fingerprint)] in force, oldest first, with fingerprints recomputed from the
    keys themselves. A key event counts only if its key is valid and, after the first, the previous key signed it.
    Events that fail are ignored (and reported), so an appended or edited key line cannot take over signing."""
    rows = jsonl(FOUNDER_AUTH)
    keys, problems = [], []
    for e in jsonl(LEDGER):
        if e.get("event") != "founder-key":
            continue
        key = e.get("key")
        fp = key_fingerprint(key) if key else None
        if not fp:
            problems.append(f"founder-key event at {e.get('t')} has no valid public key")
            continue
        if keys:
            cand = [r for r in rows if r.get("ref") == e.get("authRef") and r.get("action") == "founder-key"
                    and (r.get("fields") or {}).get("key") == key]
            if not cand or not auth_row_valid(cand[0], keys):
                problems.append(f"founder-key event at {e.get('t')} is not signed by the previous key")
                continue
        keys.append((str(e.get("t")), key, fp))
    return keys, problems


def founder_keys():
    return key_chain()[0]


def ssh_verify(msg, sig_text, pubkey):
    """(ok, detail) against one pinned public key. Fails closed when ssh-keygen is missing."""
    exe = shutil.which("ssh-keygen")
    if not exe:
        return False, "ssh-keygen not found, so the signature cannot be checked"
    with tempfile.TemporaryDirectory() as d:
        signers = pathlib.Path(d) / "allowed_signers"
        signers.write_text(f'founder namespaces="{NAMESPACE}" {pubkey}\n')
        sig = pathlib.Path(d) / "request.sig"
        sig.write_text(sig_text)
        r = subprocess.run([exe, "-Y", "verify", "-f", str(signers), "-I", "founder", "-n", NAMESPACE, "-s", str(sig)],
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
    """None means refused. Otherwise (label, ref): ('attested', None) before any key exists, ('signed', ref) after,
    where ref is the sha256 of the signed message, also stored with the signature in founder-auth.jsonl."""
    bad = [k for k, v in fields.items() if CONTROL_CHARS.search(str(v))]
    if bad:
        print(f"refused: control characters (newlines, tabs) in {', '.join(bad)}")
        return None
    if not key_ever_registered():
        print("warning: no founder key is registered (graph.py founder-key), so this is recorded as attested, not signed;"
              " attested revenue never forms the face")
        return "attested", None
    keys, problems = key_chain()
    if not keys:
        print("refused: a founder key was registered (ledger or git history) but no valid key is in the ledger now; founder"
              " actions stay closed until the ledger is restored. " + "; ".join(problems))
        return None
    msg = auth_message(action, fields)
    if not sig_path:
        print("refused: a founder key is registered, so this action needs the founder's signature.")
        print("Sign this exact request on the founder's machine (save it as request.txt, both lines):")
        print(msg + f"  ssh-keygen -Y sign -f ~/.ssh/id_ed25519 -n {NAMESPACE} request.txt\nthen re-run with --sig request.txt.sig")
        return None
    try:
        sig = pathlib.Path(sig_path).read_text()
    except OSError as e:
        print(f"refused: cannot read signature file: {e}")
        return None
    t, key, fp = keys[-1]
    ok, why = ssh_verify(msg, sig, key)
    if not ok:
        print(f"refused: the signature does not verify for this exact action at this point in the record ({why})")
        return None
    ref = msg_ref(msg)
    if any(r.get("ref") == ref for r in jsonl(FOUNDER_AUTH)):
        print("refused: this signature was already used")
        return None
    with FOUNDER_AUTH.open("a") as f:
        f.write(json.dumps({"t": now(), "action": action, "fields": fields, "msg": msg, "sig": sig, "ref": ref, "keyFp": fp}) + "\n")
    return "signed", ref


def verified_auth_rows():
    """{ref: row} for founder-auth rows whose signature verifies against the key that was in force when it was made."""
    keys = founder_keys()
    return {r["ref"]: r for r in jsonl(FOUNDER_AUTH) if r.get("ref") and auth_row_valid(r, keys)}


def revenue_verified(entries):
    """Marks each revenue entry sigVerified only if a verified founder signature covers exactly its fields."""
    rows = verified_auth_rows() if any(e.get("authRef") for e in entries) else {}
    out = []
    for e in entries:
        r = rows.get(e.get("authRef"))
        ok = bool(r) and r.get("action") == "revenue add" and r.get("fields") == revenue_fields(
            float(e.get("amountUsd") or 0), str(e.get("payer")), str(e.get("evidence")))
        out.append(dict(e, sigVerified=ok))
    return out


def founder_key_state():
    keys, problems = key_chain()
    return {"registered": key_ever_registered(), "fingerprint": keys[-1][2] if keys else None,
            "registeredAt": keys[0][0] if keys else None, "rotations": max(0, len(keys) - 1), "problems": problems}


# A verifier's check row ends with exactly one verdict, "VERDICT: PASS" or "VERDICT: FAIL", in plain characters.
VERDICT_END = re.compile(r"VERDICT: (PASS|FAIL)\.?\s*$")
VERDICT_WORD = re.compile(r"verdict\s*:", re.I)
# Rows that can change a task's outputs: after one of these, an earlier check no longer counts.
CHANGE_KINDS = ("write", "edit", "run")
RESTART = re.compile(r"^(start|unblock|reopen)\b")


def verdict_of(text):
    """'PASS' or 'FAIL' when the text ends with exactly one well-formed verdict, else None. Text that changes under
    Unicode compatibility normalisation or carries invisible format characters has no verdict, so look-alike
    letters and zero-width characters cannot hide or fake one."""
    text = str(text)
    if unicodedata.normalize("NFKC", text) != text or any(unicodedata.category(c) == "Cf" for c in text):
        return None
    if len(VERDICT_WORD.findall(text)) != 1:
        return None
    m = VERDICT_END.search(text)
    return m.group(1) if m else None


def path_hash(f):
    """sha256 of a file, or of a directory tree (relative paths and file hashes, symlinks resolved); None if missing
    or an empty directory."""
    f = f.resolve() if f.is_symlink() else f
    if f.is_file():
        return hashlib.sha256(f.read_bytes()).hexdigest()
    if f.is_dir():
        files = sorted(p for p in f.rglob("*") if p.is_file())
        if not files:
            return None
        h = hashlib.sha256()
        for p in files:
            h.update(str(p.relative_to(f)).encode() + b"\0" + hashlib.sha256(p.read_bytes()).hexdigest().encode() + b"\0")
        return "dir:" + h.hexdigest()
    return None


def output_hashes(n):
    return {o: path_hash(ROOT / o) for o in n["outputs"]}


def verifier_cleared(n):
    """(ok, reason). done needs, after the last change to the task (a self-logged write, edit or run row by anyone,
    or a start, unblock or reopen), at least one verifier check with a PASS verdict, no FAIL verdict, and every
    verifier row in that span (including the read the verifier logs when it starts) pinned to the outputs as they
    are now."""
    rows = jsonl(ACTIVITY / f"{n['id']}.jsonl")
    last_change = -1
    for i, r in enumerate(rows):
        own_change = r.get("src") == "self" and r.get("kind") in CHANGE_KINDS
        restart = r.get("src") == "ledger" and RESTART.match(str(r.get("text", "")))
        if own_change or restart:
            last_change = i
    # Verifier rows logged through graph.py (src self) carry the output hashes; ingested transcript rows do not.
    span = [r for r in rows[last_change + 1:] if r.get("actor") == "verifier" and r.get("src") == "self"]
    verdicts = [verdict_of(r.get("text", "")) for r in span if r.get("kind") == "check"]
    verdicts = [v for v in verdicts if v]
    if not verdicts:
        return False, ("no verifier verdict is recorded since the last change; the verifier runs "
                       f'graph.py log {n["id"]} check --verifier "<criteria> ... VERDICT: PASS" first')
    if "FAIL" in verdicts:
        return False, "a verifier verdict since the last change is FAIL; fix the gaps (a change) and have the verifier check again"
    now = output_hashes(n)
    if any(r.get("outputs") != now for r in span):
        return False, "the outputs changed during or after the verifier's review (their hashes differ); the verifier must check again"
    return True, ""


def founder_key_cmd(args):
    args, sig_path = pop_sig(args)
    parts = " ".join(args).split()
    if len(parts) < 2 or parts[0] not in KEY_TYPES:
        print('usage: founder-key "ssh-ed25519 AAAA... comment" [--sig file]  (an ed25519 or ECDSA public key)')
        return 1
    key = " ".join(parts[:2])
    fp = key_fingerprint(key)
    if not fp:
        print("refused: not a valid public key (or ssh-keygen is missing)")
        return 1
    ref = None
    if key_ever_registered():
        # Replacing the key needs the current key's signature, so an agent cannot swap in its own.
        res = founder_auth("founder-key", {"key": key}, sig_path)
        if res is None or res[0] != "signed":
            return 1
        ref = res[1]
    ledger_append("founder-key", "D01", f"founder signing key {'rotated to' if ref else 'registered'}: {fp}. "
                  "Founder: check it matches `ssh-keygen -lf ~/.ssh/id_ed25519.pub` on your Mac.",
                  auth="signed" if ref else "first-use", key=key, fp=fp, authRef=ref)
    print(f"registered founder key {fp}")
    if not ref:
        print("First registration is trust on first use: the founder must confirm this fingerprint matches their own key.")
    return 0


def authorize_cmd(args, g):
    """Prints the exact request the founder signs for clear-gate, unblock or revenue add."""
    if args[:1] in (["clear-gate"], ["unblock"]) and len(args) >= 2 and args[1] in index(g):
        fields = {"node": args[1], "note": " ".join(args[2:])}
        if args[0] == "clear-gate":
            fields["outputs"] = output_hashes(index(g)[args[1]])
        print(auth_message(args[0], fields), end="")
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


def activity_append(node_id, agent, kind, text, src="self", t=None, actor=None, outputs=None):
    ACTIVITY.mkdir(parents=True, exist_ok=True)
    rec = {"t": t or now(), "node": node_id, "agent": agent, "kind": kind, "text": text[:LOG_TEXT_MAX], "src": src}
    if len(text) > LOG_TEXT_MAX:
        print(f"warning: activity text is {len(text)} characters; stored the first {LOG_TEXT_MAX}. Log the rest as a second row.")
        rec["truncated"] = True
    if actor:
        rec["actor"] = actor
    if outputs is not None:
        rec["outputs"] = outputs
    with (ACTIVITY / f"{node_id}.jsonl").open("a") as f:
        f.write(json.dumps(rec) + "\n")


def activity_all():
    out = {}
    if not ACTIVITY.exists():
        return out
    for p in sorted(ACTIVITY.glob("*.jsonl")):
        rows = [r for r in jsonl(p) if isinstance(r, dict)]
        seen, uniq = set(), []
        for r in sorted(rows, key=lambda r: str(r.get("t", ""))):
            k = (r.get("t"), r.get("kind"), r.get("text"))
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
             "revenue": revenue_verified(revenue_all()), "founderKey": founder_key_state(), "audit": audit_state()}
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
    res = founder_auth("revenue add", revenue_fields(amount, payer, evidence), sig_path)
    if res is None:
        return 1
    auth, ref = res
    entry = {"t": now(), "amountUsd": round(amount, 2), "payer": payer, "evidence": evidence, "recordedBy": "founder", "auth": auth}
    if ref:
        entry["authRef"] = ref
    REVENUE.parent.mkdir(parents=True, exist_ok=True)
    with REVENUE.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    export(g)
    print(f"recorded ${entry['amountUsd']:,.2f} from {payer} (evidence: {entry['evidence']}; {auth})")
    return 0


def revenue_fields(amount, payer, evidence):
    return {"amountUsd": f"{round(amount, 2):.2f}", "payer": payer, "evidence": evidence}


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
        text = " ".join(args[2:])
        outputs = None
        if actor:
            # Every verifier row pins the outputs as they are now, so a change during the review is caught.
            outputs = output_hashes(n)
        if actor and args[1] == "check":
            # A verifier's check is the thing done relies on: never cut it, and require one plain verdict at the end.
            if len(text) > LOG_TEXT_MAX:
                print(f"refused: a verifier check must fit in {LOG_TEXT_MAX} characters ({len(text)} given); "
                      "put details in earlier note rows and the verdict in this one")
                return 1
            if not verdict_of(text):
                print('refused: a verifier check must end with exactly one verdict, "VERDICT: PASS" or "VERDICT: FAIL",'
                      " in plain characters, and use the word verdict nowhere else")
                return 1
        activity_append(n["id"], n["agent"], args[1], text, actor=actor, outputs=outputs)
        export(g)
        print(f"{n['id']} logged {args[1]}")
        return 0
    note = " ".join(args[1:])
    view = derived(n, idx)
    auth = auth_ref = None
    if cmd == "start":
        if view != "ready":
            print(f"refused: {n['id']} is {view}, not ready")
            return 1
        n["status"] = "running"
    elif cmd == "done":
        if n["status"] != "running":
            print(f"refused: {n['id']} is {n['status']}, start it first")
            return 1
        hashes = output_hashes(n)
        missing = [o for o, h in hashes.items() if h is None or ((ROOT / o).is_file() and (ROOT / o).stat().st_size == 0)]
        if missing:
            print("refused: missing or empty outputs: " + ", ".join(missing))
            return 1
        ok, why = verifier_cleared(n)
        if not ok:
            print(f"refused: {why}")
            return 1
        gate = n.get("gate")
        n["status"] = "awaiting_human" if gate and not gate.get("cleared") else "done"
        if n["status"] == "awaiting_human":
            print(f"prepared; waiting on founder: {gate['reason']}")
    elif cmd == "reopen":
        # Back to running for rework: the output must be verified again, and an earlier founder approval no longer
        # covers it (the gate is re-armed). Conservative, so it needs no signature.
        if n["status"] not in ("done", "awaiting_human"):
            print(f"refused: {n['id']} is {n['status']}; only done or awaiting_human tasks can be reopened")
            return 1
        if not note.strip():
            print('usage: reopen <NODE_ID> "why"')
            return 1
        if n.get("gate") and n["gate"].get("cleared"):
            note = f"{note} (founder approval '{n['gate']['cleared']}' re-armed)"
            n["gate"]["cleared"] = None
        n["status"] = "running"
    elif cmd == "block":
        if n["status"] not in ("pending", "running"):
            print(f"refused: {n['id']} is {n['status']}; only pending or running tasks can be blocked")
            return 1
        n["status"] = "blocked"
    elif cmd == "unblock":
        if n["status"] != "blocked":
            print(f"refused: {n['id']} is {n['status']}, not blocked")
            return 1
        res = founder_auth("unblock", {"node": n["id"], "note": note}, sig_path)
        if res is None:
            return 1
        auth, auth_ref = res
        n["status"] = "pending"
    elif cmd == "clear-gate":
        if not n.get("gate"):
            print(f"{n['id']} has no gate")
            return 1
        hashes = output_hashes(n)
        if n["status"] == "awaiting_human":
            # The founder approves the content the verifier passed: refuse if it changed since done.
            closed = [e for e in jsonl(LEDGER) if e.get("node") == n["id"] and e.get("event") == "done"]
            if not closed or closed[-1].get("outputs") != hashes:
                print(f"refused: {n['id']}'s outputs are not the ones verified at done; reopen it and have it verified again")
                return 1
        res = founder_auth("clear-gate", {"node": n["id"], "note": note, "outputs": hashes}, sig_path)
        if res is None:
            return 1
        auth, auth_ref = res
        n["gate"]["cleared"] = note or "cleared"
        if n["status"] == "awaiting_human":
            n["status"] = "done"
    else:
        print(f"unknown command {cmd}")
        return 1
    save(g)
    ledger_append(cmd, n["id"], note, auth=auth, authRef=auth_ref,
                  outputs=output_hashes(n) if cmd in ("done", "clear-gate") else None)
    activity_append(n["id"], n["agent"], {"start": "plan", "done": "handoff", "block": "blocked"}.get(cmd, "note"),
                    f"{cmd}{': ' + note if note else ''}", src="ledger")
    export(g)
    print(f"{n['id']} -> {cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
