#!/usr/bin/env python3
"""Turn sub-agent transcripts into the timestamped activity log the dashboards show.

Ground truth, not narration: every entry is a real tool call (search query,
file read or written, command run) or a real tool failure, stamped with the
time the transcript recorded it. Output is appended to graph/activity/<NODE>.jsonl
(deduplicated on export).

  python3 perspective-engine/tools/activity.py <NODE_ID> <transcript.jsonl> [--verifier]
      --verifier: the transcript is the independent verifier's run; its rows are credited to the verifier. The call
      that logged this task's verifier check (graph.py log <NODE_ID> check --verifier ...) is marked "related":
      "check": that call, not a mention of the task, is the evidence the auditor needs to give separation-of-duties
      credit
      --related: the transcript covered several tasks; keep only the calls that acted on this task: its ID or one of
      its input or output paths in the file, search or command the call ran (not in content it wrote or handed back,
      nor in a note or other quoted prose the command passed on), so another task's work is never credited to this
      one. Each kept row records how it matched ("related": "check", "id" or "path"): a command that only names an
      output may have read it as another task's input
  python3 perspective-engine/tools/activity.py --runs perspective-engine/graph/runs.json
  python3 perspective-engine/tools/activity.py --ledger    # backfill start/done events from the ledger
"""
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import graph  # noqa: E402

ROOT = graph.ROOT


def short(s, n=160):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def rel(p):
    p = str(p)
    for prefix in (str(ROOT) + "/", "/home/user/High-Properties/"):
        if p.startswith(prefix):
            return p[len(prefix):]
    return p


def describe(name, inp):
    """Map one tool call to (kind, text). Returns None for plumbing calls."""
    if name in ("WebSearch",):
        return "search", f"Searched: {short(inp.get('query', ''), 140)}"
    if name in ("WebFetch",):
        return "fetch", f"Opened {short(inp.get('url', ''), 140)}"
    if name == "Read":
        return "read", f"Read {rel(inp.get('file_path', ''))}"
    if name == "Write":
        words = len(str(inp.get("content", "")).split())
        return "write", f"Wrote {rel(inp.get('file_path', ''))} ({words:,} words)"
    if name in ("Edit", "MultiEdit"):
        return "edit", f"Edited {rel(inp.get('file_path', ''))}"
    if name in ("Glob", "Grep"):
        return "read", f"Looked up {name.lower()} {short(inp.get('pattern', ''), 80)}"
    if name == "Bash":
        cmd = inp.get("command", "")
        desc = inp.get("description")
        return "run", short(desc or cmd, 160) if desc else f"Ran {short(cmd, 140)}"
    if name in ("ToolSearch", "TaskCreate", "TaskUpdate", "TaskList"):
        return None
    if name in ("SubagentHandback", "StructuredOutput"):
        return "handoff", "Handed the result back to the orchestrator"
    return "run", f"Used {name}"


# What --related matches: what a call acted on, never what it carried. A shell command keeps its own words but loses
# heredoc bodies, inline scripts (python3 -c, node -e), the notes it passes to graph.py and any other quoted text with
# a space in it, however graph.py was reached ($G log M04 check --verifier '... V12 NOT CHECKED'): those are content,
# like a Write's text, and a task named inside them was talked about, not worked on. A quoted single word (a path, a
# grep pattern) stays, and so does a quoted variable passed to graph.py (log "$t" check: the task a loop is on).
WORD = r"""(?:'[^']*'|"(?:[^"\\]|\\.)*"|\\.|[^\s'"\\;&|<>()])+"""
HEREDOC = re.compile(r"(?<!<)<<-?[ \t]*(['\"]?)([A-Za-z_]\w*)\1([^\n]*).*?\n[ \t]*\2[ \t]*(?=\n|$)", re.S)
INLINE = re.compile(rf"(\b(?:python[\d.]*|node|tsx)(?:\s+-[\w=-]+)*?\s+(?:-c|-e|-p|--eval|--print))\s+{WORD}")
GRAPH_ARGS = re.compile(rf"((?:\S*/)?graph\.py\b)((?:[ \t]+{WORD})*)")
QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")
# Every task runs graph.py, directly or through a variable (T=.../graph.py && python3 $T done ...); running it is not
# work on graph.py itself (F01's output).
RUN_GRAPH = re.compile(r"(\bpython[\d.]*(?:\s+-\w+)*\s+|(?<![\w$-])[A-Za-z_]\w*=)(?:\S*/)?graph\.py\b")
ASSIGN = re.compile(r"(?<![\w$-])([A-Za-z_]\w*)=('[^']*'|\"(?:[^\"\\]|\\.)*\"|\S*)")
VAR = re.compile(r"\$\{?([A-Za-z_]\w*)\}?")
# The call that logged a task's verifier check: graph.py log <ID> check --verifier "... VERDICT: PASS" (graph.py takes
# --verifier anywhere among its arguments), the ID written out or a loop's variable (for t in V05 V07; do ... $t ...).
VERIFIER_CHECK = re.compile(rf"\bgraph\.py[ \t]+log((?:[ \t]+{WORD})+)")


def command_words(cmd):
    """A shell command as --related reads it: without heredoc bodies, inline scripts, graph.py notes or quoted prose,
    and with graph.py named where a variable set to it in the same command runs it ($G log V12 ...)."""
    cmd = HEREDOC.sub(lambda m: f"<<{m.group(2)}{m.group(3)}", cmd)
    cmd = cmd.replace("\\\n", " ")  # a line continuation: the shell reads one line
    cmd = INLINE.sub(r"\1 ''", cmd)
    for v in {m.group(1) for m in ASSIGN.finditer(cmd) if re.search(r"(?<![\w.-])graph\.py\b", m.group(2))}:
        cmd = re.sub(rf"\"?\$(?:\{{{v}\}}|{v}\b)\"?", "graph.py", cmd)
    arg = lambda q: q.group(0) if q.group(0)[0] == '"' and VAR.fullmatch(q.group(0)[1:-1]) else "''"
    cmd = GRAPH_ARGS.sub(lambda m: m.group(1) + QUOTED.sub(arg, m.group(2)), cmd)
    cmd = QUOTED.sub(lambda m: "''" if re.search(r"\s", m.group(0)) else m.group(0), cmd)
    return RUN_GRAPH.sub(r"\1graph.py", cmd)


def acted_on(name, inp):
    """The text --related matches for one call: the file a Read, Write or Edit touched, the path and pattern a search
    used, or the command a shell ran. Never written content, edit strings, prompts or handoff bodies."""
    if name in ("Read", "Write", "Edit", "MultiEdit", "NotebookEdit"):
        return str(inp.get("file_path") or inp.get("notebook_path") or "")
    if name in ("Glob", "Grep"):
        return f"{inp.get('path') or ''} {inp.get('pattern') or ''}"
    if name == "Bash":
        return command_words(str(inp.get("command", "")))
    return ""


def extract(transcript):
    rows, pending = [], {}
    # A call's id (transcript name + tool_use id) lets one call credited to several tasks be counted once.
    call = lambda i: f"{pathlib.Path(transcript).stem}:{i}" if i else None
    with open(transcript) as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = (o.get("timestamp") or "")[:19]
            if len(ts) < 19:
                continue  # no usable timestamp: skip rather than invent one
            t = ts + "Z"
            msg = o.get("message") or {}
            content = msg.get("content") if isinstance(msg, dict) else None
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict):
                    continue
                if o.get("type") == "assistant" and b.get("type") == "tool_use":
                    d = describe(b.get("name", ""), b.get("input") or {})
                    if d:
                        pending[b.get("id")] = len(rows)
                        # "match" (never stored) is what the call acted on, so --related can see the command or
                        # path behind a short description.
                        rows.append({"t": t, "kind": d[0], "text": d[1], "call": call(b.get("id")),
                                     "match": acted_on(b.get("name", ""), b.get("input") or {})})
                elif o.get("type") == "user" and b.get("type") == "tool_result" and b.get("is_error"):
                    i = pending.get(b.get("tool_use_id"))
                    txt = b.get("content")
                    txt = txt if isinstance(txt, str) else json.dumps(txt)
                    reason = "blocked by the network proxy" if "EGRESS" in txt or "egress" in txt or "403" in txt else short(txt, 90)
                    rows.append({"t": t, "kind": "blocked", "text": f"Failed ({reason}): {rows[i]['text'] if i is not None else ''}"[:240],
                                 "call": call(b.get("tool_use_id")), "match": rows[i]["match"] if i is not None else ""})
    return rows


def related(n, text):
    """How a row names task n: "check" when the call logged its verifier check through graph.py, "id" for its ID as a
    whole word, "path" for one of its input or output paths as a whole path (dashboard/index.html is not inside
    data/roi-dashboard/index.html), None if it does not."""
    for m in VERIFIER_CHECK.finditer(text):
        args = [w.strip("'\"") for w in re.findall(WORD, m.group(1))]
        node, kind = ([a for a in args if a != "--verifier"] + ["", ""])[:2]
        if "--verifier" not in args or kind != "check":
            continue
        if v := VAR.fullmatch(node):
            loops = re.finditer(rf"\bfor[ \t]+{v.group(1)}[ \t]+in((?:[ \t]+{WORD})+)", text[:m.start()])
            if n["id"] in {w.strip("'\"") for f in loops for w in re.findall(WORD, f.group(1))}:
                return "check"
        elif node == n["id"]:
            return "check"
    if re.search(rf"(?<![A-Za-z0-9]){re.escape(n['id'])}(?![A-Za-z0-9])", text):
        return "id"
    paths = {q for p in n.get("outputs", []) + n.get("inputs", []) if p for q in (rel(p), rel(p).removeprefix("perspective-engine/"))}
    return "path" if any(re.search(rf"(?<![\w.-]){re.escape(q)}(?![\w/-]|\.\w)", text) for q in paths) else None


def ingest(node, transcript, agent=None, actor=None, only_related=False):
    g = graph.load()
    n = graph.index(g)[node]
    rows = extract(transcript)
    for r in rows:
        how = related(n, r.get("match", r["text"]))
        # A transcript about this task alone is all its work, so only the call that logged its verifier check is
        # marked there: the auditor's evidence that a separate verifier run checked this task.
        r["related"] = how if only_related or how == "check" else None
    if only_related:
        rows = [r for r in rows if r["related"]]
    # Idempotent: a transcript ingested twice adds nothing the second time.
    have = {(r.get("t"), r.get("kind"), r.get("text")) for r in graph.jsonl(graph.ACTIVITY / f"{node}.jsonl") if isinstance(r, dict)}
    rows = [r for r in rows if (r["t"], r["kind"], r["text"]) not in have]
    graph.ACTIVITY.mkdir(parents=True, exist_ok=True)
    with (graph.ACTIVITY / f"{node}.jsonl").open("a") as f:
        for r in rows:
            # graph.activity_append's record, plus the id of the call the row came from and how the call named this
            # task (see above).
            rec = {"t": r["t"], "node": node, "agent": agent or n["agent"], "kind": r["kind"], "text": r["text"], "src": "transcript"}
            rec.update({k: v for k, v in (("actor", actor), ("call", r.get("call")), ("related", r.get("related"))) if v})
            f.write(json.dumps(rec) + "\n")
    return len(rows)


def backfill_ledger():
    g = graph.load()
    idx = graph.index(g)
    kinds = {"start": "plan", "done": "handoff", "block": "blocked", "unblock": "note", "clear-gate": "note"}
    count = 0
    for e in graph.ledger_all():
        n = idx.get(e["node"])
        if not n:
            continue
        verb = {"start": "Task started", "done": "Task finished", "block": "Task blocked", "unblock": "Task unblocked", "clear-gate": "Founder cleared the gate"}.get(e["event"], e["event"])
        graph.activity_append(n["id"], n["agent"], kinds.get(e["event"], "note"), f"{verb}{': ' + e['note'] if e.get('note') else ''}", src="ledger", t=e["t"])
        count += 1
    return count


def main(argv):
    with graph.locked():
        if argv[:1] == ["--ledger"]:
            print(f"backfilled {backfill_ledger()} ledger events")
        elif argv[:1] == ["--runs"]:
            runs = json.loads(pathlib.Path(argv[1]).read_text())
            for node, info in runs.items():
                p = pathlib.Path(info["transcript"])
                if p.exists():
                    print(f"{node}: {ingest(node, p)} events from {p.name}")
                else:
                    print(f"{node}: transcript missing ({p})")
        elif len(argv) >= 2:
            actor = "verifier" if "--verifier" in argv[2:] else None
            n = ingest(argv[0], argv[1], actor=actor, only_related="--related" in argv[2:])
            print(f"{argv[0]}: {n} events" + (" (verifier)" if actor else ""))
        else:
            print(__doc__)
            return 1
        graph.export(graph.load())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
