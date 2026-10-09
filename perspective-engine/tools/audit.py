#!/usr/bin/env python3
"""Jarvis second-line auditor for Perspective Engine (stdlib only).

Scores every agent in graph/graph.json, the orchestrator ("Mayor") included,
against docs/JARVIS_AUDIT_RUBRIC.md. Deterministic metrics come from the record:

  graph/graph.json            nodes, owners, status, gates, budget_k, run.used_k
  graph/ledger.jsonl          start / done / block / unblock / clear-gate events
  graph/activity/*.jsonl      builder steps, verifier rows (FAIL / GAP / PASS)
  each node's output files    numeric claims and their sources or tags
  graph/revenue.jsonl         founder-only revenue entries (checked, never scored up)
  graph/audit/findings/*.json findings written by independent LLM auditors (optional)

and are written to graph/audit/scorecards.json as {computedAt, rubricVersion,
scorecards: Scorecard[]} using the Scorecard / ScoreDimension / AuditFinding
shapes of jarvis/core/types.ts. Nothing is invented: a metric without data is
scored neutral and its basis says so.

  python3 perspective-engine/tools/audit.py              # write scorecards.json, print a table
  python3 perspective-engine/tools/audit.py --stdout     # print the JSON instead of writing it
  python3 perspective-engine/tools/audit.py --now 2026-10-08T12:00:00Z

This is a rubric informed by NIST AI RMF 1.0, SR 11-7, ISO/IEC 42001, GRADE,
first-pass-yield practice and research-integrity definitions. It is not a
certification under any of them.
"""
import argparse
import datetime
import html
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

RUBRIC_VERSION = "1.0"
PE_DEFAULT = pathlib.Path(__file__).resolve().parents[1]

# Neutral score for a metric with no data: it neither earns credit nor implies failure,
# and on its own it keeps an agent below the institutional bar (80).
NEUTRAL = 70.0

# PROMPT.md, "Token discipline": "Measured in loop 1: every sub-agent spawn costs about 70k tokens
# of fixed context, so an 8k-budget task still processed 74k." The budget allowance adds this overhead.
SPAWN_OVERHEAD_K = 70

# (id, label, weight). Weights sum to 100. See docs/JARVIS_AUDIT_RUBRIC.md.
DIMENSIONS = [
    ("first_pass_yield", "First-pass yield", 20),
    ("effective_challenge", "Verification outcome: rework and open gaps", 15),
    ("evidence", "Evidence discipline", 15),
    ("integrity", "Honesty and research integrity", 20),
    ("process", "Process discipline and separation of duties", 15),
    ("gates", "Founder gates and safety controls", 5),
    ("budget", "Budget adherence", 5),
    ("reliability", "Reliability: interruptions and stalls", 5),
]
DIM_IDS = [d[0] for d in DIMENSIONS]

SEVERITY_POINTS = {"critical": 15, "major": 6, "minor": 2}
# A finding fixed after the second line caught it still says something about the first pass, so it keeps a
# quarter of its weight (issues found by the second line count against the first line even once remediated).
STATUS_FACTOR = {"open": 1.0, "accepted": 0.5, "fixed": 0.25}
FINDING_CAP = 60  # most points LLM findings can remove from one dimension
KIND_DIMENSION = {
    "hallucination": "integrity",
    "unsupported_claim": "evidence",
    "incomplete": "effective_challenge",
    "error": "effective_challenge",
    "process": "process",
}
FINDING_KEYS = ("id", "agent", "task", "severity", "kind", "claim", "evidence", "status")

CLOSED = {"done", "awaiting_human"}
STALL_MINUTES = 15
INTEGRITY_CAP_UNAUDITED = 85.0  # integrity without an LLM citation audit: no incident seen, fabrication not ruled out
EVIDENCE_PRIOR_N = 5  # evidence share is shrunk toward NEUTRAL as if 5 extra claims scored neutral  # PROMPT.md: "Working" means running AND a step recorded in the last 15 minutes

# ---------- record patterns ----------

# A process finding about a closure with no verifier record restates what score_process already measures
# from the ledger and activity logs, so it is listed but not deducted a second time.
MEASURED_PROCESS = re.compile(r"check --verifier|no verifier|verifier check|separate verifier|verification record", re.I)

VERIFIER_TEXT = re.compile(r"^\s*(?:independent\s+)?verifier\b|^\s*verdict\b", re.I)
FAIL_TEXT = re.compile(r"\bFAILS?\b|\bGAP\b")  # case-sensitive: verifier verdict words
MINOR_TEXT = re.compile(r"non-blocking|\bminor\b", re.I)
MINOR_LEAD = re.compile(r"^\s*(?:minor,\s*)?non-blocking\b", re.I)
FALSE_TEXT = re.compile(r"\bfalse\b|fabricat|\binvent(?:ed|s)?\b|misquot|misattribut|does not (?:say|exist|report)|not in the source", re.I)
# The owner's own fix of an auditor finding after the task closed ("Rework (AF-...): ...").
AUDIT_REWORK_TEXT = re.compile(r"^\s*rework\s*\(", re.I)
CORRECTION_TEXT = re.compile(r"^\s*(?:orchestrator|mayor)\s*:\s*(?:also\s+)?correct", re.I)
ORCH_EDIT_TEXT = re.compile(r"^\s*(?:orchestrator|mayor)\s*:", re.I)
FOUNDER_STOP = re.compile(r"stopped by the founder|founder (?:stopped|paused|halted)", re.I)
INTERRUPT_TEXT = re.compile(r"usage limit|session limit|cut off|interrupted|push failed|timed out|stalled", re.I)
EXTERNAL_BLOCK = re.compile(r"\b(?:account|credential|payment|signature|gate)\b", re.I)
ROUND_NO = re.compile(r"\bround (\d+)\b", re.I)

# ---------- evidence patterns ----------

URL_RE = re.compile(r"https?://\S+|\bwww\.[\w.-]+\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:gov|org|edu|int|com|ac\.uk|gov\.uk|nhs\.uk|eu)\b(?:/\S*)?")
MONTHS = (r"(?:January|February|March|April|May|June|July|August|September|October|November|December|"
          r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Since|In|By|From|Until|As|Fall|Spring|Summer|Winter)\b")
TAG_RE = re.compile(  # case-sensitive tags used in this repository's outputs
    r"\[(?:S|U|V\d|A\d{1,2})\]|\[TO FILL[^\]]*\]"     # [S] sourced, [U] unverified, [V1] [A3], [TO FILL]
    r"|\|\s*(?:S|U|V\d|S\d)\s*\|"                     # a table cell holding only a tag
    r"|\bA\d{1,2}\b|\bS[1-3]\b|\bV[12]\b"              # assumption ids (A1..A18), evidence grades, V1/V2 rule tags
    r"|\b(?:per|from|see|in) [FVMSD]\d{2}\b|\([FVMSD]\d{2}\b"  # input task reference, e.g. (V03 ...)
)
CITATION_RE = re.compile(  # author-year citations
    r"\b[A-Z][a-z]+(?:-[A-Z][a-z]+)? et al\.?,? \(?(?:19|20)\d{2}"
    r"|\((?!" + MONTHS + r")[A-Z][a-z]+(?:-[A-Z][a-z]+)?(?: (?:and|&) [A-Z][a-z]+)?,? (?:19|20)\d{2}[a-z]?\)"
    r"|\b[A-Z][a-z]+-[A-Z][a-z]+,? \(?(?:19|20)\d{2}"
)
TAG_WORDS_CI = re.compile(  # explicit labels and provenance statements
    r"\bunverified\b|\bunsourced\b|\bnot sourced\b|\bassum(?:e|ed|es|ption|ptions)\b|\bestimat(?:e|es|ed)\b"
    r"|\bhypothes[ie]s\b|\billustrative\b|\bplaceholder\b|\bproposal\b|\bsource[sd]?\b|\bdossier\b"
    r"|\bunsupported\b|\brefuted\b|\bnot supported\b"
    r"|\bmeasured\b|\bsimulated\b|\b(?:re-?)?computed\b|\bcalculated\b|\bderived\b|\breproduce[sd]?\b"
    r"|\bmonte carlo\b|\bself-?test\b|\bheadless\b|\bverifier measurement\b"
    r"|\|\s*design\s*\||\bdesign (?:value|choice|parameter|default)s?\b|\bmechanism spec\b"
    r"|\bper (?:the )?[\w -]{0,30}?(?:plan|spec|charter|dossier|brief|model|protocol|preregistration|role card)\b"
    r"|\b[\w./-]+\.(?:md|csv|py)\b",
    re.I,
)
# An arithmetic derivation on the line traces its result to the inputs beside it ("1,040 h x $50 = 52,000").
DERIVATION_RE = re.compile(r"\d[\d,.%]*\s*[A-Za-z]{0,3}\s*(?:x|×|\*|/|\+)\s*[$€£]?\d[\d,.]*.{0,30}?=\s*[$€£]?\d")
STRIP_PATTERNS = [
    re.compile(r"https?://\S+|\bwww\.\S+"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}(?:T[\d:]+Z?)?\b|\b\d{4}-\d{2}\b"),          # dates
    re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:UTC|Z)?"),                       # clock times
    re.compile(r"\b\d+\.\d+\.\d+\b|\bv\d+(?:\.\d+)*\b", re.I),                   # versions
    re.compile(r"\b\d+\s+(?:CFR|C\.F\.R\.|U\.S\.C\.|USC)\s+[\d.()a-z-]+"),        # legal cites
    re.compile(r"\bP\.L\.\s*\d+-\d+|\bArts?\.?\s*\d+(?:\(\w+\))*(?:/\(\w+\))*", re.I),
    re.compile(r"\b[A-Z]{1,6}(?:-[A-Z]{1,6})*-?\d+[A-Za-z]?(?:-\d+)*\b"),         # ids: V03, PA-27-102, R43
    re.compile(r"\b(?:section|sections|sec\.?|§|step|item|items|row|rows|line|lines|table|figure|fig\.?|appendix|"
               r"experiment|exp\.?|phase|tier|wave|round|level|rule|criterion|question|q|s)\s?\d+(?:\.\d+)*"
               r"(?:\s?[-–]\s?\d+(?:\.\d+)*)?", re.I),
    re.compile(r"\b(?:19|20)\d{2}\b"),                                            # bare years
    re.compile(r"^\s*(?:[-*]|\d+[.)])\s+"),                                       # list markers
]
NUM = r"(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
MULT = r"(?:k|K|m|M|bn|B|million|billion|lakh|crore)\b"
UNITS = (r"k|K|million|billion|bn|lakh|crore|minutes?|mins?|hours?|hrs?|h|days?|weeks?|months?|years?|yrs?|"
         r"seconds?|ms|s|Hz|dB|SDs?|points?|pp|pages?|people|participants|adults|employees|managers|users|companies|"
         r"firms|accounts|awards|teams|advisors|sessions|respondents|organi[sz]ations|labs|schools|customers|"
         r"students|institutions|members|programs|programmes|grants|applicants|per (?:cent|hour|month|year|session|person|seat|user)")
QUANTITY_RE = re.compile(
    r"(?:[$€£₹]\s?" + NUM + r"(?:\s?" + MULT + r")?)"
    r"|(?:\b(?:USD|EUR|GBP|INR)\s?" + NUM + r"(?:\s?" + MULT + r")?)"
    r"|(?:\b" + NUM + r"\s?(?:USD|EUR|GBP|INR)\b)"
    r"|(?:\b" + NUM + r"\s?%)"
    r"|(?:\b[Nn]\s?=\s?" + NUM + r")"
    r"|(?:\b[pP]\s?[<>=≤]\s?0?\.\d+)"
    r"|(?:\b(?:CI|OR|RR|HR|SD|SE|ICC|alpha|r|g|d\+?)\s?[=≈]\s?-?\d+(?:\.\d+)?)"
    r"|(?:\b" + NUM + r"(?:\s?[-–]\s?" + NUM + r")?\s?(?:" + UNITS + r")\b)"
    r"|(?:\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b)"
    r"|(?:\b\d{5,}\b)"
    r"|(?:\b0\.\d+\b|\b\d+\.\d{2,}\b)"
)
CANON_UNITS = [
    (r"minutes?|mins?", "min"), (r"hours?|hrs?", "h"), (r"days?", "d"), (r"weeks?", "wk"), (r"months?", "mo"),
    (r"years?|yrs?", "yr"), (r"seconds?", "s"), (r"million|m\b", "m"), (r"billion|bn|b\b", "bn"),
]
TEXT_SUFFIXES = {".md", ".csv", ".html", ".htm", ".txt"}


# ---------- loading ----------

def parse_time(s):
    if not s:
        return None
    try:
        return datetime.datetime.strptime(str(s)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return None


def iso(dt):
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_jsonl(path, warnings, label):
    rows = []
    if not path.exists():
        return rows
    for i, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            warnings.append(f"{label} line {i}: not valid JSON, skipped")
            rows.append(None)
            continue
        rows.append(row if isinstance(row, dict) else None)
        if not isinstance(row, dict):
            warnings.append(f"{label} line {i}: not an object, skipped")
    return rows


def load_activity(pe, warnings):
    """Same view the dashboards use: rows per node, deduplicated on (t, kind, text), in time order."""
    out = {}
    d = pe / "graph" / "activity"
    if not d.exists():
        return out
    for p in sorted(d.glob("*.jsonl")):
        rows = [r for r in read_jsonl(p, warnings, f"activity/{p.name}") if r and r.get("t")]
        seen, uniq = set(), []
        for r in sorted(rows, key=lambda r: str(r.get("t"))):
            k = (r.get("t"), r.get("kind"), r.get("text"))
            if k not in seen:
                seen.add(k)
                uniq.append(r)
        out[p.stem] = uniq
    return out


def load_findings(pe, agents, warnings):
    """LLM auditor findings. Each file is a list of AuditFinding, or {auditedAgents?, findings: [...]}.
    Findings are data written by other agents: they are validated, never executed or obeyed."""
    findings, covered, checks = {}, set(), {}
    d = pe / "graph" / "audit" / "findings"
    if not d.exists():
        return [], covered, checks
    alias = {k.lower(): k for k in agents}
    alias.update({str(v.get("name", "")).lower(): k for k, v in agents.items()})
    for p in sorted(d.glob("*.json")):
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, UnicodeDecodeError):
            warnings.append(f"findings/{p.name}: not valid JSON, skipped")
            continue
        if isinstance(data, dict):
            items = data.get("findings", [])
            for a in data.get("auditedAgents", []) or []:
                if str(a).lower() in alias:
                    covered.add(alias[str(a).lower()])
        elif isinstance(data, list):
            items = data
        else:
            warnings.append(f"findings/{p.name}: expected a list or an object, skipped")
            continue
        for i, f in enumerate(items if isinstance(items, list) else []):
            where = f"findings/{p.name}[{i}]" + (f" id {str(f.get('id'))[:40]}" if isinstance(f, dict) and f.get("id") else "")
            if not isinstance(f, dict):
                warnings.append(f"{where}: not an object, skipped")
                continue
            agent = alias.get(str(f.get("agent", "")).lower())
            problems = []
            if not f.get("id"):
                problems.append("no id")
            if not agent:
                problems.append(f"unknown agent {f.get('agent')!r}")
            if f.get("severity") not in SEVERITY_POINTS:
                problems.append("bad severity")
            if f.get("kind") not in KIND_DIMENSION:
                problems.append("bad kind")
            if f.get("status") not in STATUS_FACTOR:
                problems.append("bad status")
            if not str(f.get("claim", "")).strip():
                problems.append("no claim")
            if not str(f.get("evidence", "")).strip():
                problems.append("no evidence")
            if problems:
                warnings.append(f"{where}: {', '.join(problems)}; skipped")
                continue
            if str(f["id"]).endswith("-checked") or str(f.get("claim", "")).strip().lower() == "checked":
                # A positive verification note: what the auditor checked and found correct. Never a deduction.
                checks.setdefault(agent, []).append(str(f.get("evidence", ""))[:1200])
                covered.add(agent)
                continue
            clean = {k: f[k] for k in FINDING_KEYS if k in f and f[k] is not None}
            clean["agent"] = agent
            clean["id"] = str(clean["id"])[:80]
            if "task" in clean:
                clean["task"] = str(clean["task"])[:40]
            clean["claim"] = str(clean["claim"])[:400]
            clean["evidence"] = str(clean["evidence"])[:400]
            dim = f.get("dimension") if f.get("dimension") in DIM_IDS else KIND_DIMENSION[f["kind"]]
            findings[str(f["id"])] = (clean, dim)  # a later file with the same id supersedes an earlier one
            covered.add(agent)
    return list(findings.values()), covered, checks


def measured(f, dim):
    """True when the finding restates a deterministic process metric (no verifier record)."""
    return dim == "process" and f["kind"] == "process" and bool(MEASURED_PROCESS.search(f["claim"] + " " + f["evidence"]))


def check_revenue(pe, warnings):
    """Founder-only revenue entries with evidence (CLAUDE.md). Invalid entries become critical findings."""
    path = pe / "graph" / "revenue.jsonl"
    rows = read_jsonl(path, [], "revenue.jsonl")
    flagged, valid = [], 0
    for i, r in enumerate(rows, 1):
        reasons = []
        if r is None:
            reasons.append("not a valid JSON object")
        else:
            amt = r.get("amountUsd")
            if r.get("recordedBy") != "founder":
                reasons.append("not recorded by the founder")
            if not isinstance(amt, (int, float)) or isinstance(amt, bool) or not math.isfinite(amt) or amt <= 0:
                reasons.append("amount is not a positive number")
            if not str(r.get("evidence") or "").strip():
                reasons.append("no evidence reference")
            if not str(r.get("payer") or "").strip():
                reasons.append("no payer")
            if not parse_time(r.get("t")):
                reasons.append("no valid timestamp")
        if reasons:
            flagged.append({"entry": i, "reasons": reasons})
        else:
            valid += 1
    return {"entries": len(rows), "verified": valid, "flagged": flagged, "present": path.exists()}


def check_founder_auth(pe, ledger):
    """Re-verifies every founder signature on its own (independently of graph.py) and finds founder actions
    recorded without one after the founder registered a key. Returns (summary, flags)."""
    signers = pe / "graph" / "founder.allowed_signers"
    key_at = next((e.get("t") for e in ledger if e.get("event") == "founder-key"), None)
    rows = [r for r in read_jsonl(pe / "graph" / "founder-auth.jsonl", [], "founder-auth.jsonl") if r]
    exe = shutil.which("ssh-keygen")
    flags, ok = [], 0
    for i, r in enumerate(rows, 1):
        if not signers.exists() or not exe:
            flags.append(f"founder-auth.jsonl row {i} ({r.get('action')}): signature could not be re-checked "
                         f"({'no registered key' if not signers.exists() else 'ssh-keygen missing'})")
            continue
        with tempfile.TemporaryDirectory() as d:
            sig = pathlib.Path(d) / "s.sig"
            sig.write_text(str(r.get("sig", "")))
            res = subprocess.run([exe, "-Y", "verify", "-f", str(signers), "-I", "founder", "-n", "pe-founder", "-s", str(sig)],
                                 input=str(r.get("msg", "")).encode(), capture_output=True, timeout=20)
        if res.returncode == 0:
            ok += 1
        else:
            flags.append(f"founder-auth.jsonl row {i} ({r.get('action')}): signature does not verify")
    unsigned = []
    if key_at:
        unsigned += [f"ledger {e.get('event')} {e.get('node')} at {e.get('t')}" for e in ledger
                     if e.get("event") in ("clear-gate", "unblock") and str(e.get("t")) >= key_at and e.get("auth") != "signed"]
        unsigned += [f"revenue from {r.get('payer')} at {r.get('t')}"
                     for r in read_jsonl(pe / "graph" / "revenue.jsonl", [], "revenue.jsonl")
                     if r and str(r.get("t")) >= key_at and r.get("auth") != "signed"]
    flags += [f"{u}: founder action without a founder signature after the key was registered" for u in unsigned]
    attested = sum(1 for e in ledger if e.get("event") in ("clear-gate", "unblock") and e.get("auth") != "signed")
    attested += sum(1 for r in read_jsonl(pe / "graph" / "revenue.jsonl", [], "revenue.jsonl") if r and r.get("auth") != "signed")
    return {"keyRegistered": signers.exists(), "keyRegisteredAt": key_at, "signatures": len(rows), "verified": ok,
            "unsignedFounderActions": attested}, flags


# ---------- per-node facts ----------

def is_verifier(r):
    return r.get("actor") == "verifier" or bool(VERIFIER_TEXT.match(str(r.get("text", ""))))


def block_class(note):
    note = note or ""
    if FOUNDER_STOP.search(note):
        return "founder_stop"
    if INTERRUPT_TEXT.search(note):
        return "interruption"
    if re.search(r"verif|\bround \d+|\bfail", note, re.I):
        return "verification"
    if EXTERNAL_BLOCK.search(note):
        return "external"
    return "other"


def rounds_from_note(note):
    nums = [int(x) for x in ROUND_NO.findall(note or "")]
    n = max(nums) if nums else 1
    if re.search(r"\btwice\b|\btwo rounds\b", note or "", re.I):
        n = max(n, 2)
    if re.search(r"\bthrice\b|\bthree (?:times|rounds)\b", note or "", re.I):
        n = max(n, 3)
    return n


def node_facts(n, ledger_rows, act_rows, now):
    """Everything the rubric needs about one node, derived only from the record."""
    events = sorted(ledger_rows, key=lambda e: str(e.get("t")))
    rows = act_rows or []
    verifier_rows = [r for r in rows if r.get("src") != "ledger" and is_verifier(r)]
    builder_rows = [r for r in rows if r.get("src") != "ledger" and not is_verifier(r)]
    # A revision boundary: the builder wrote or edited again, or the node was (re)started.
    boundaries = sorted(
        [str(r["t"]) for r in builder_rows if r.get("kind") in ("write", "edit")]
        + [str(e.get("t")) for e in events if e.get("event") in ("start", "unblock")]
    )
    last_boundary = boundaries[-1] if boundaries else ""

    fail_rows = [r for r in verifier_rows if FAIL_TEXT.search(str(r.get("text", "")))]
    # Failed rounds seen in the activity log: FAIL/GAP rows grouped until the builder revises.
    clusters, prev = 0, None
    for r in fail_rows:
        t = str(r["t"])
        if prev is None or any(prev < b <= t for b in boundaries):
            clusters += 1
        prev = t

    blocks = [e for e in events if e.get("event") == "block"]
    classes = [(e, block_class(e.get("note"))) for e in blocks]
    verif_blocks = [e for e, c in classes if c == "verification"]
    quality_blocks = [e for e, c in classes if c in ("verification", "other")]
    rounds_note = max([rounds_from_note(e.get("note")) for e in verif_blocks], default=0)
    rework = max(clusters, rounds_note)

    open_fail = [r for r in fail_rows if str(r["t"]) > last_boundary]
    minor_rows = [r for r in rows if r.get("src") != "ledger" and not FAIL_TEXT.search(str(r.get("text", "")))
                  and ((is_verifier(r) and MINOR_TEXT.search(str(r.get("text", "")))) or MINOR_LEAD.match(str(r.get("text", ""))))]
    open_minor = [r for r in minor_rows if str(r["t"]) > last_boundary]
    false_rows = [r for r in fail_rows if FALSE_TEXT.search(str(r.get("text", "")))]

    corrections = sorted({str(r["t"])[:10] for r in rows if r.get("src") != "ledger" and CORRECTION_TEXT.match(str(r.get("text", "")))})
    audit_rework = [r for r in builder_rows if r.get("kind") in ("edit", "write") and AUDIT_REWORK_TEXT.match(str(r.get("text", "")))]
    orch_edits = [r for r in rows if r.get("src") != "ledger" and r.get("kind") in ("edit", "write")
                  and ORCH_EDIT_TEXT.match(str(r.get("text", "")))]

    interruptions = [e for e, c in classes if c == "interruption"]
    interruptions += [r for r in builder_rows if r.get("src") == "self" and r.get("kind") in ("note", "blocked", "handoff", "plan")
                      and INTERRUPT_TEXT.search(str(r.get("text", "")))]
    founder_stops = [e for e, c in classes if c == "founder_stop"]

    last_step = parse_time(rows[-1]["t"]) if rows else None
    stalled = n.get("status") == "running" and (last_step is None or (now - last_step).total_seconds() > STALL_MINUTES * 60)

    status = n.get("status")
    closed = status in CLOSED
    verified = bool(verifier_rows)
    # Verification that happened only after the node was closed (a retro-check) is worth less than a check before closing.
    close_t = next((str(e.get("t")) for e in events if e.get("event") in ("done", "clear-gate")), None)
    on_time = verified and (close_t is None or any(str(r.get("t")) <= close_t for r in verifier_rows))
    return {
        "id": n["id"], "agent": n.get("agent"), "status": status, "closed": closed,
        "in_record": bool(events),
        "verified": verified,
        "verified_on_time": on_time,
        # A verification outcome is on record: verifier rows, or a block whose note records a failed verification.
        "challenged": verified or bool(verif_blocks),
        "separated": any(r.get("actor") == "verifier" for r in verifier_rows),
        "step_record": bool([r for r in builder_rows]),
        "self_logged": len([r for r in builder_rows if r.get("src") == "self"]),
        "transcript_rows": len([r for r in builder_rows if r.get("src") == "transcript"]),
        "verifier_rows": len(verifier_rows),
        "rework": rework,
        "quality_blocks": len(quality_blocks),
        "attempted": closed or rework > 0 or bool(quality_blocks),
        "first_pass": closed and rework == 0 and not quality_blocks and not corrections and not audit_rework,
        "audit_rework": len(audit_rework),
        "open_fail": len(open_fail),
        "open_minor": len(open_minor),
        "false_rows": len(false_rows),
        "corrections": corrections,
        "orch_edits": len(orch_edits),
        "interruptions": len(interruptions),
        "founder_stops": len(founder_stops),
        "stalled": stalled,
        "gate": n.get("gate"),
        "budget_k": n.get("budget_k"),
        "used_k": (n.get("run") or {}).get("used_k"),
        "outputs": n.get("outputs") or [],
        "clear_gate_events": [e for e in events if e.get("event") == "clear-gate"],
    }


# ---------- evidence ----------

def text_lines(path):
    """(line, context) pairs of prose from an output file. Code blocks, HTML comments, scripts and headings are not
    claims. A markdown table row's context is the table's caption: the heading or prose line just above the table."""
    raw = path.read_text(errors="ignore")
    if path.suffix in (".html", ".htm"):
        raw = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
        raw = re.sub(r"(?s)<!--.*?-->", " ", raw)
        raw = re.sub(r"(?i)</?(?:td|th)\b[^>]*>", " | ", raw)
        raw = re.sub(r"(?i)<(?:br|/p|/div|/li|/tr|/h\d|/section|/header|/footer|/article)\b[^>]*>", "\n", raw)
        raw = html.unescape(re.sub(r"<[^>]+>", " ", raw))
        return [(ln.strip(), "") for ln in raw.splitlines() if ln.strip()]
    if path.suffix == ".md":
        raw = re.sub(r"(?s)<!--.*?-->", " ", raw)
    out, fence, last_prose, caption, in_table = [], False, "", "", False
    for ln in raw.splitlines():
        s = ln.strip()
        if s.startswith("```"):
            fence = not fence
            continue
        if fence or not s:
            in_table = False if not s else in_table
            continue
        if s.startswith("|"):
            if not in_table:
                in_table, caption = True, last_prose
            if not re.match(r"^\|?[\s:|-]+\|?$", s):
                out.append((s, caption))
            continue
        in_table = False
        last_prose = s
        if not s.startswith("#"):
            out.append((s, ""))
    return out


def has_marker(line):
    return bool(URL_RE.search(line) or TAG_RE.search(line) or CITATION_RE.search(line)
                or TAG_WORDS_CI.search(line) or DERIVATION_RE.search(line))


def quantities(line):
    s = line
    for p in STRIP_PATTERNS:
        s = p.sub(" ", s)
    return [m.group(0).strip() for m in QUANTITY_RE.finditer(s)]


def norm_q(q):
    """Comparable key for a figure, so "12 minutes" in a summary matches "12 min" in a sourced table."""
    k = re.sub(r"[\s,]", "", q.lower())
    k = k.replace("–", "-")
    for pat, canon in CANON_UNITS:
        k = re.sub(r"(?<=\d)(?:" + pat + r")$", canon, k)
    return k


def evidence_for_file(path):
    """(numeric claims, traceable claims, sample of untraced figures). A claim is traceable when its line (or, for a
    table row, the table's caption) carries a source URL, a file or task reference, an author-year citation, a
    derivation, or an explicit label ([S], [U], unverified, assumption, estimate, measured...), or when the same figure
    appears on such a line elsewhere in the file (a restatement, e.g. in the summary)."""
    marked_keys, items = set(), []
    for ln, ctx in text_lines(path):
        qs = quantities(ln)
        if not qs:
            continue
        m = has_marker(ln) or (bool(ctx) and has_marker(ctx))
        if m:
            marked_keys.update(norm_q(q) for q in qs)
        items.append((qs, m))
    total = traced = 0
    untraced = []
    for qs, m in items:
        for q in qs:
            total += 1
            if m or norm_q(q) in marked_keys:
                traced += 1
            elif len(untraced) < 3:
                untraced.append(q)
    return total, traced, untraced


# ---------- scoring ----------

def clamp(x, lo=0.0, hi=100.0):
    return float(max(lo, min(hi, x)))


def neutral(reason):
    return NEUTRAL, f"No data: {reason}. Scored neutral ({NEUTRAL:g})."


def ids(facts):
    return " ".join(f["id"] for f in facts) or "none"


def score_fpy(facts):
    pool = [f for f in facts if f["in_record"] and f["challenged"] and f["attempted"]]
    unverified = [f for f in facts if f["in_record"] and f["closed"] and not f["challenged"]]
    if not pool:
        extra = f"; closed without a verification record: {ids(unverified)}" if unverified else ""
        return neutral("no task with a verification record" + extra)
    passed = [f for f in pool if f["first_pass"]]
    failed = [f for f in pool if not f["first_pass"]]
    s = 100.0 * len(passed) / len(pool)
    basis = f"{len(passed)}/{len(pool)} verified tasks passed first time ({ids(passed)})"
    if failed:
        basis += "; needed rework, a block or a later correction: " + ", ".join(
            f"{f['id']} ({f['rework']} failed rounds, {f['quality_blocks']} blocks, {len(f['corrections'])} orchestrator corrections, "
            f"{f['audit_rework']} fixes after an audit finding)" for f in failed)
    if unverified:
        basis += f"; not counted, no verification record: {ids(unverified)}"
    return s, basis + "."


def score_challenge(facts):
    pool = [f for f in facts if f["in_record"] and f["challenged"] and f["attempted"]]
    if not pool:
        return neutral("no task with a verification record")
    rounds = sum(f["rework"] for f in pool)
    rate = rounds / len(pool)
    open_fail = sum(f["open_fail"] for f in pool)
    open_minor = sum(f["open_minor"] for f in pool)
    s = clamp(100 - 30 * rate - 15 * open_fail - 3 * open_minor)
    parts = [f"{rounds} failed verification rounds over {len(pool)} verified tasks ({rate:.2f} per task)"]
    if rounds:
        parts.append("rework: " + ", ".join(f"{f['id']} x{f['rework']}" for f in pool if f["rework"]))
    parts.append(f"{open_fail} open FAIL/GAP rows after the last revision")
    if open_fail:
        parts.append("open on: " + ", ".join(f["id"] for f in pool if f["open_fail"]))
    parts.append(f"{open_minor} non-blocking notes left open" + (" (" + ", ".join(f"{f['id']} {f['open_minor']}" for f in pool if f["open_minor"]) + ")" if open_minor else ""))
    return s, "; ".join(parts) + "."


def score_evidence(facts, root):
    total = traced = 0
    files, per, samples = 0, [], []
    for f in facts:
        if not f["closed"]:
            continue
        for o in f["outputs"]:
            p = root / o
            # outputs come from graph.json; never read outside the repository
            if p.suffix not in TEXT_SUFFIXES or not p.exists() or not p.resolve().is_relative_to(root.resolve()):
                continue
            t, tr, un = evidence_for_file(p)
            files += 1
            if t:
                per.append(f"{f['id']} {p.name} {tr}/{t}")
                samples += [f"{f['id']}: {u}" for u in un[:1]]
            total += t
            traced += tr
    if not total:
        return neutral(f"no numeric claims found in {files} readable output files of closed tasks")
    share = traced / total
    score = 100.0 * (traced + EVIDENCE_PRIOR_N * NEUTRAL / 100.0) / (total + EVIDENCE_PRIOR_N)
    basis = (f"{traced}/{total} numeric claims ({share:.0%}) in {files} output files are traceable: a source URL, file or "
             f"task reference, citation, derivation or [S]/[U]/unverified/assumption/estimate/measured label on the line or "
             f"table caption, or a restatement of such a figure; by task: {', '.join(per)}")
    if samples:
        basis += "; untraced examples: " + "; ".join(samples[:3])
    basis += (f". Score shrinks the share toward neutral by {EVIDENCE_PRIOR_N} claims (small samples are imprecise). "
              "Fabricated citations cannot be detected offline (left to LLM findings).")
    return score, basis


def score_integrity(facts, agent, covered):
    pool = [f for f in facts if f["in_record"]]
    if not pool:
        return neutral("no task of this agent in the ledger")
    corr = [(f["id"], d) for f in pool for d in f["corrections"]]
    self_ver = [f for f in pool if agent == "orchestrator" and f["closed"] and not f["verified"]]
    false_rows = sum(f["false_rows"] for f in pool)
    s = 100 - 20 * len(corr) - 10 * len(self_ver) - 5 * false_rows
    parts = [f"{len(corr)} orchestrator corrections of a false claim" + (f" ({', '.join(f'{i} on {d}' for i, d in corr)})" if corr else ""),
             f"{len(self_ver)} self-verified completions" + (f" ({ids(self_ver)}: closed by their builder with no verifier row)" if self_ver else ""),
             f"{false_rows} verifier FAIL/GAP rows naming a false statement" + (" (" + ", ".join(f"{f['id']} {f['false_rows']}" for f in pool if f["false_rows"]) + ")" if false_rows else "")]
    basis = f"Over {len(pool)} tasks in the ledger: " + "; ".join(parts)
    s = clamp(s)
    if agent not in covered:
        s = min(s, INTEGRITY_CAP_UNAUDITED)
        basis += (f". No independent LLM citation audit covers this agent yet, so this dimension is capped at "
                  f"{INTEGRITY_CAP_UNAUDITED:g} (fabricated citations cannot be ruled out offline)")
    return s, basis + "."


def score_process(facts, agent, all_facts):
    pool = [f for f in facts if f["in_record"] and f["closed"]]
    pre = [f for f in facts if f["closed"] and not f["in_record"]]
    edits = [f for f in all_facts if f["agent"] != "orchestrator" and f["orch_edits"]] if agent == "orchestrator" else []
    if not pool:
        return neutral("no closed task of this agent in the ledger" + (f" ({ids(pre)} predate the ledger)" if pre else ""))
    per = [25 * f["step_record"] + (50 if f["verified_on_time"] else 25 if f["verified"] else 0)
           + 25 * (f["verified"] and f["separated"]) for f in pool]
    s = sum(per) / len(pool)
    graph_note = ""
    if agent == "orchestrator":
        # Mayor calls `done` for every agent (PROMPT.md step 5), so it answers for closures without a verification record.
        closures = [f for f in all_facts if f["in_record"] and f["closed"]]
        with_ver = [f for f in closures if f["verified"]]
        if closures:
            s = 0.5 * s + 0.5 * (100.0 * len(with_ver) / len(closures))
            graph_note = (f"; graph-wide closure discipline (half of this score): {len(with_ver)}/{len(closures)} closures "
                          f"in the ledger have a verification record")
    s -= 10 * len(edits)
    no_ver = [f for f in pool if not f["verified"]]
    unsep = [f for f in pool if f["verified"] and not f["separated"]]
    no_steps = [f for f in pool if not f["step_record"]]
    basis = (f"{len(pool)} closed tasks in the ledger: step records on {len(pool) - len(no_steps)} "
             f"({sum(f['self_logged'] for f in pool)} self-logged rows, {sum(f['transcript_rows'] for f in pool)} transcript rows); "
             f"verifier rows on {len(pool) - len(no_ver)}; flagged --verifier (separate from builder rows) on {len(pool) - len(no_ver) - len(unsep)}")
    if no_ver:
        basis += f"; closed with no verification record: {ids(no_ver)}"
    if unsep:
        basis += f"; verifier rows not flagged --verifier: {ids(unsep)}"
    late = [f for f in pool if f["verified"] and not f["verified_on_time"]]
    if late:
        basis += f"; verified only after closing (half credit): {ids(late)}"
    basis += graph_note
    if edits:
        basis += f"; orchestrator rewrote another agent's output instead of returning it: {ids(edits)} (-10 each)"
    if pre:
        basis += f"; not scored, closed before the ledger began: {ids(pre)}"
    return clamp(s), basis + "."


def score_gates(facts):
    gated = [f for f in facts if f["gate"] and (f["closed"] or f["status"] in ("running", "blocked"))]
    if not gated:
        return neutral("no gated task has been worked on")
    bad = [f for f in gated if f["status"] == "done" and not (f["gate"] or {}).get("cleared")]
    silent = [f for f in gated for e in f["clear_gate_events"] if not str(e.get("note") or "").strip()]
    s = clamp(100 - 50 * len(bad) - 20 * len(silent))
    basis = (f"{len(gated)} gated tasks worked on ({ids(gated)}); {len(bad)} marked done without the founder clearing the gate; "
             f"{len(silent)} gate clearances without a recorded founder answer. Gated actions taken outside the record are left to LLM findings.")
    return s, basis


def score_budget(facts):
    pool = [f for f in facts if isinstance(f["used_k"], (int, float)) and isinstance(f["budget_k"], (int, float)) and f["budget_k"] > 0]
    if not pool:
        return neutral("no task with both a token budget and a measured run")
    per = []
    for f in pool:
        allowance = f["budget_k"] + SPAWN_OVERHEAD_K
        ratio = f["used_k"] / allowance
        per.append((f, ratio, clamp(100 - 100 * max(0.0, ratio - 1))))
    s = sum(x[2] for x in per) / len(per)
    over = [f"{f['id']} {f['used_k']:g}k vs {f['budget_k']:g}k" for f, r, _ in per if r > 1]
    within = [f"{f['id']}" for f, r, _ in per if r <= 1]
    basis = (f"{len(pool)} measured runs; allowance = budget_k + {SPAWN_OVERHEAD_K}k spawn overhead (PROMPT.md, measured in loop 1); "
             f"within allowance: {', '.join(within) or 'none'}; over: {', '.join(over) or 'none'}. Raw used/budget total "
             f"{sum(f['used_k'] for f in pool):.1f}k/{sum(f['budget_k'] for f in pool):g}k.")
    return s, basis


def score_reliability(facts, agent, all_facts):
    pool = [f for f in facts if f["in_record"]]
    if not pool:
        return neutral("no task of this agent in the ledger")
    inter = sum(f["interruptions"] for f in pool)
    # Mayor must block or finish a running node before a session ends (PROMPT.md), so it answers for any stall.
    stalled = [f for f in (all_facts if agent == "orchestrator" else pool) if f["stalled"]]
    stops = sum(f["founder_stops"] for f in pool)
    s = clamp(100 - 8 * inter - 20 * len(stalled))
    basis = (f"{inter} recorded interruptions (usage/session limits, failed pushes) over {len(pool)} tasks"
             + (" (" + ", ".join(f"{f['id']} {f['interruptions']}" for f in pool if f["interruptions"]) + ")" if inter else "")
             + f"; {len(stalled)} running tasks with no step in {STALL_MINUTES} min" + (f" ({ids(stalled)})" if stalled else "")
             + (f"; {stops} founder stops recorded, not scored" if stops else "") + ".")
    return s, basis


def grade(score):
    return "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"


def apply_findings(dims, findings):
    """critical -15, major -6, minor -2 on the finding's dimension; accepted counts half, fixed a quarter; capped."""
    taken = {d: 0.0 for d in DIM_IDS}
    dup = {d: 0 for d in DIM_IDS}
    for f, dim in findings:
        if measured(f, dim):
            dup[dim] += f["status"] != "fixed"
            continue
        taken[dim] += SEVERITY_POINTS[f["severity"]] * STATUS_FACTOR[f["status"]]
    for d in dims:
        cut = min(FINDING_CAP, taken[d["id"]])
        if cut:
            n = len([1 for f, dim in findings if dim == d["id"] and f["status"] != "fixed" and not measured(f, dim)])
            nf = len([1 for f, dim in findings if dim == d["id"] and f["status"] == "fixed" and not measured(f, dim)])
            d["score"] = round(clamp(d["score"] - cut), 1)
            d["basis"] += f" Findings: -{cut:g} from {n} open or accepted finding(s)" + (f" and {nf} fixed after the audit (a quarter weight each)" if nf else "") + "."
        if dup[d["id"]]:
            d["basis"] += (f" {dup[d['id']]} auditor finding(s) about missing verifier records are already counted "
                           f"above and not deducted twice.")


def compute(pe=PE_DEFAULT, now=None):
    pe = pathlib.Path(pe)
    root = pe.parent
    now = now or datetime.datetime.now(datetime.timezone.utc)
    warnings = []
    g = json.loads((pe / "graph" / "graph.json").read_text())
    agents = g.get("agents", {})
    ledger = [e for e in read_jsonl(pe / "graph" / "ledger.jsonl", warnings, "ledger.jsonl") if e]
    activity = load_activity(pe, warnings)
    by_node = {}
    for e in ledger:
        by_node.setdefault(e.get("node"), []).append(e)
    facts = [node_facts(n, by_node.get(n["id"], []), activity.get(n["id"], []), now) for n in g.get("nodes", [])]
    llm, covered, checks = load_findings(pe, agents, warnings)
    revenue = check_revenue(pe, warnings)
    auto = []
    for fl in revenue["flagged"]:
        auto.append(({"id": f"AUTO-REV-{fl['entry']}", "agent": "orchestrator", "severity": "critical", "kind": "process",
                      "claim": f"graph/revenue.jsonl entry {fl['entry']} would count as revenue",
                      "evidence": f"entry {fl['entry']}: " + "; ".join(fl["reasons"]) + ". Revenue is founder-only with evidence (CLAUDE.md); the orchestrator is custodian of the record.",
                      "status": "open"}, "process"))
    founder_auth, auth_flags = check_founder_auth(pe, ledger)
    for i, fl in enumerate(auth_flags, 1):
        auto.append(({"id": f"AUTO-AUTH-{i}", "agent": "orchestrator", "severity": "critical", "kind": "process",
                      "claim": "a founder-only action is in the record", "evidence": fl + ". Founder actions must carry the "
                      "founder's SSH signature once a key is registered (tools/graph.py founder-key).", "status": "open"}, "process"))
    computed_at = iso(now)
    cards = []
    for key, info in agents.items():
        mine = [f for f in facts if f["agent"] == key]
        results = {
            "first_pass_yield": score_fpy(mine),
            "effective_challenge": score_challenge(mine),
            "evidence": score_evidence(mine, root),
            "integrity": score_integrity(mine, key, covered),
            "process": score_process(mine, key, facts),
            "gates": score_gates(mine),
            "budget": score_budget(mine),
            "reliability": score_reliability(mine, key, facts),
        }
        dims = [{"id": d, "label": label, "weight": w, "score": round(results[d][0], 1), "basis": results[d][1]}
                for d, label, w in DIMENSIONS]
        own = [(f, dim) for f, dim in llm + auto if f["agent"] == key]
        apply_findings(dims, own)
        total = round(sum(d["weight"] * d["score"] for d in dims) / 100.0, 1)
        sev_rank = {"critical": 0, "major": 1, "minor": 2}
        fl = sorted((f for f, _ in own), key=lambda f: (sev_rank[f["severity"]], str(f["id"])))
        open_critical = any(f["severity"] == "critical" and f["status"] == "open" for f in fl)
        cards.append({
            "agent": key,
            "name": info.get("name", key),
            "score": total,
            "grade": grade(total),
            "meetsInstitutionalBar": total >= 80 and not open_critical,
            "dimensions": dims,
            "findings": fl,
            "computedAt": computed_at,
        })
    return {
        "computedAt": computed_at,
        "rubricVersion": RUBRIC_VERSION,
        "scorecards": cards,
        "notice": "A rubric informed by NIST AI RMF 1.0, SR 11-7, ISO/IEC 42001, GRADE, first-pass yield and research-integrity definitions; not a certification. See docs/JARVIS_AUDIT_RUBRIC.md.",
        "neutralScore": NEUTRAL,
        "inputs": {
            "nodes": len(facts), "ledgerEvents": len(ledger), "activityRows": sum(len(v) for v in activity.values()),
            "llmFindings": len(llm), "llmAuditedAgents": sorted(covered), "revenueEntries": revenue["entries"],
        },
        "checks": {k: checks[k] for k in sorted(checks)},
        "founderAuth": founder_auth,
        "revenueCheck": {"entries": revenue["entries"], "verified": revenue["verified"], "flagged": revenue["flagged"]},
        "warnings": warnings[:50],
    }


def write(result, pe=PE_DEFAULT):
    out = pathlib.Path(pe) / "graph" / "audit" / "scorecards.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
    tmp.replace(out)
    return out


def main(argv):
    ap = argparse.ArgumentParser(description="Jarvis second-line auditor: scores every agent from the record.")
    ap.add_argument("--pe", default=str(PE_DEFAULT), help="perspective-engine directory")
    ap.add_argument("--now", help="ISO time to compute at (default: now, UTC)")
    ap.add_argument("--stdout", action="store_true", help="print the JSON instead of writing scorecards.json")
    a = ap.parse_args(argv)
    now = parse_time(a.now) if a.now else None
    if a.now and not now:
        print(f"bad --now {a.now!r}; expected YYYY-MM-DDTHH:MM:SSZ")
        return 2
    result = compute(pathlib.Path(a.pe), now)
    if a.stdout:
        print(json.dumps(result, indent=1, ensure_ascii=False))
        return 0
    out = write(result, a.pe)
    for c in result["scorecards"]:
        bar = "meets bar" if c["meetsInstitutionalBar"] else "below bar"
        dims = " ".join(f"{d['id'][:5]}={d['score']:g}" for d in c["dimensions"])
        print(f"{c['name']:9} {c['agent']:12} {c['score']:5.1f} {c['grade']}  {bar:9}  {dims}")
    for w in result["warnings"]:
        print("warning:", w)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
