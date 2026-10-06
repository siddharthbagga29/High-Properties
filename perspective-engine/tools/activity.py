#!/usr/bin/env python3
"""Turn sub-agent transcripts into the timestamped activity log the dashboards show.

Ground truth, not narration: every entry is a real tool call (search query,
file read or written, command run) or a real tool failure, stamped with the
time the transcript recorded it. Output is appended to graph/activity/<NODE>.jsonl
(deduplicated on export).

  python3 perspective-engine/tools/activity.py <NODE_ID> <transcript.jsonl> [--agent KEY]
  python3 perspective-engine/tools/activity.py --runs perspective-engine/graph/runs.json
  python3 perspective-engine/tools/activity.py --ledger    # backfill start/done events from the ledger
"""
import json
import pathlib
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


def extract(transcript):
    rows, pending = [], {}
    with open(transcript) as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = (o.get("timestamp") or "")[:19] + "Z"
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
                        rows.append({"t": t, "kind": d[0], "text": d[1]})
                elif o.get("type") == "user" and b.get("type") == "tool_result" and b.get("is_error"):
                    i = pending.get(b.get("tool_use_id"))
                    txt = b.get("content")
                    txt = txt if isinstance(txt, str) else json.dumps(txt)
                    reason = "blocked by the network proxy" if "EGRESS" in txt or "egress" in txt or "403" in txt else short(txt, 90)
                    rows.append({"t": t, "kind": "blocked", "text": f"Failed ({reason}): {rows[i]['text'] if i is not None else ''}"[:240]})
    return rows


def ingest(node, transcript, agent=None):
    g = graph.load()
    n = graph.index(g)[node]
    rows = extract(transcript)
    for r in rows:
        graph.activity_append(node, agent or n["agent"], r["kind"], r["text"], src="transcript", t=r["t"])
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
            print(f"{argv[0]}: {ingest(argv[0], argv[1])} events")
        else:
            print(__doc__)
            return 1
        graph.export(graph.load())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
