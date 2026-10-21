"""Narrow adapter to the official Hermes Agent CLI (NousResearch/hermes-agent, MIT).

Surface used: `hermes --version` for health, and `hermes chat --query-file <file>` for a single bounded query (both
documented in the official CLI reference at the time of writing; re-check after upgrades). Nothing else: no private
internals, no network endpoints, no MCP assumptions.

Rules enforced here:
- Hermes output is untrusted. Only a JSON object that validates against the task's output schema is accepted;
  anything else is discarded. No schema contains an order, a risk limit or a status that the code would act on.
- The subprocess gets a minimal environment with secret-looking and broker variables removed, a timeout, an input
  size cap and an output size cap.
- One writer per Hermes profile: a non-blocking file lock; a second concurrent call is refused, not queued.
- When Hermes is missing, times out, fails or returns invalid output, the deterministic fallback for that task kind
  runs and `hermes_unavailable` / `fallback_used` events are logged. Nothing in trading depends on Hermes.
"""
import fcntl
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field, asdict

from .. import ROOT
from ..events import redact

MAX_INPUT = 32_000
MAX_OUTPUT = 64_000
DENY_ENV = re.compile(r"(?i)(key|secret|token|password|passwd|credential|broker|alpaca|ibkr|account)")


@dataclass(frozen=True)
class TaskContract:
    task_id: str
    kind: str                       # one of FALLBACKS
    goal: str
    inputs: dict = field(default_factory=dict)
    timeout_s: int = 180
    retry_budget: int = 1
    escalation: str = "fall back to the deterministic path and log it"


# Output schemas: {field: (type, required, extra)}; extra = max length for str, allowed values for enums
SCHEMAS = {
    "propose_experiments": {"proposals": (list, True, 5), "rationale": (str, True, 2000)},
    "diagnose_failure": {"likely_cause": (str, True, 1000), "next_step": (str, True, 1000),
                         "confidence": (str, True, ("low", "medium", "high"))},
    "summarize": {"summary": (str, True, 3000)},
}
PROPOSAL_FIELDS = {"strategy": str, "params": dict, "hypothesis": str}


class SchemaError(Exception):
    pass


def validate_output(kind, obj):
    schema = SCHEMAS[kind]
    if not isinstance(obj, dict):
        raise SchemaError("output is not an object")
    extra = set(obj) - set(schema)
    if extra:
        raise SchemaError(f"unexpected fields {sorted(extra)}")
    for name, (typ, required, lim) in schema.items():
        if name not in obj:
            if required:
                raise SchemaError(f"missing {name}")
            continue
        v = obj[name]
        if not isinstance(v, typ):
            raise SchemaError(f"{name} must be {typ.__name__}")
        if isinstance(lim, tuple) and v not in lim:
            raise SchemaError(f"{name} must be one of {lim}")
        if isinstance(lim, int) and len(v) > lim:
            raise SchemaError(f"{name} too long")
    if kind == "propose_experiments":
        from ..strategies import REGISTRY
        for p in obj["proposals"]:
            if not isinstance(p, dict) or set(p) != set(PROPOSAL_FIELDS):
                raise SchemaError("each proposal needs exactly strategy, params, hypothesis")
            if p["strategy"] not in REGISTRY:
                raise SchemaError(f"unknown strategy {p['strategy']!r}")
            if not all(isinstance(x, int) and 1 <= x <= 400 for x in p["params"].values()):
                raise SchemaError("params must be small positive integers")
    return obj


def extract_json(text):
    """Return the last top-level JSON object in free text, or None."""
    depth, start, found = 0, None, None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0:
                try:
                    found = json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    pass
    return found


# -- deterministic fallbacks ---------------------------------------------------------------------------------------
def _fallback_propose(inputs):
    tried = {(p.get("fast"), p.get("slow")) for p in inputs.get("tried_params", [])}
    out = []
    for fast in (20, 50, 100):
        for slow in (100, 150, 200, 250):
            if fast < slow and (fast, slow) not in tried and len(out) < 3:
                out.append({"strategy": "sma_trend", "params": {"fast": fast, "slow": slow},
                            "hypothesis": f"SMA{fast}/{slow} trend filter; falsified if test-window Sharpe <= 0 "
                                          "or the sign flips under 2x costs"})
    return {"proposals": out, "rationale": "deterministic grid walk over untested neighbouring parameters"}


def _fallback_diagnose(inputs):
    err = str(inputs.get("error", ""))
    rules = [("ConfigError", "settings file invalid or missing", "fix config/settings.json; see docs/README"),
             ("ProviderError", "data provider unavailable or returned bad data", "use the synthetic or snapshot source"),
             ("hash mismatch", "snapshot file changed after its manifest was written", "re-download and re-snapshot"),
             ("illegal transition", "order lifecycle bug or replayed step", "inspect ledger transitions for the order")]
    for needle, cause, step in rules:
        if needle.lower() in err.lower():
            return {"likely_cause": cause, "next_step": step, "confidence": "medium"}
    return {"likely_cause": "unclassified: " + err[:200], "next_step": "reproduce with the unit tests and read the "
            "event log", "confidence": "low"}


def _fallback_summarize(inputs):
    text = str(inputs.get("text", ""))
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return {"summary": " ".join(lines[:8])[:3000]}


FALLBACKS = {"propose_experiments": _fallback_propose, "diagnose_failure": _fallback_diagnose,
             "summarize": _fallback_summarize}


@dataclass
class AgentResult:
    task_id: str
    kind: str
    output: dict
    source: str                     # "hermes" or "deterministic_fallback"
    trusted: bool = False           # always False: callers must still check outputs independently
    detail: str = ""
    elapsed_s: float = 0.0

    def to_dict(self):
        return asdict(self)


def safe_env():
    keep = {k: v for k, v in os.environ.items() if not DENY_ENV.search(k)}
    return {k: keep[k] for k in ("PATH", "HOME", "LANG", "TERM", "HERMES_HOME", "TMPDIR") if k in keep}


class HermesAdapter:
    def __init__(self, executable=None, events=None, runner=subprocess.run, lock_path=None, profile=None):
        self.executable = executable or shutil.which("hermes")
        self.events, self.runner, self.profile = events, runner, profile
        self.lock_path = lock_path or ROOT / "state" / "hermes.lock"

    def health(self):
        if not self.executable:
            return {"available": False, "detail": "hermes executable not found on PATH"}
        try:
            r = self.runner([self.executable, "--version"], capture_output=True, text=True, timeout=15, env=safe_env())
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"available": False, "detail": f"hermes --version failed: {type(e).__name__}"}
        if r.returncode != 0:
            return {"available": False, "detail": f"hermes --version exit {r.returncode}"}
        return {"available": True, "detail": (r.stdout or "").strip()[:200]}

    def run(self, task):
        if task.kind not in FALLBACKS:
            raise ValueError(f"unknown task kind {task.kind}")
        t0 = time.time()
        health = self.health()
        if not health["available"]:
            return self._fallback(task, health["detail"], t0)
        prompt = self._prompt(task)
        if len(prompt) > MAX_INPUT:
            return self._fallback(task, "input exceeds size cap", t0)
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.lock_path, "w") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return self._fallback(task, "another Hermes call holds the profile lock (one writer per profile)", t0)
            with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
                f.write(prompt)
                qpath = f.name
            try:
                profile = ["-p", self.profile] if self.profile else []  # documented: hermes -p <profile> chat
                cmd = [self.executable, *profile, "chat", "--query-file", qpath]
                r = self.runner(cmd, capture_output=True, text=True, timeout=task.timeout_s, env=safe_env())
            except subprocess.TimeoutExpired:
                return self._fallback(task, f"timed out after {task.timeout_s}s", t0)
            except OSError as e:
                return self._fallback(task, f"could not start hermes: {e}", t0)
            finally:
                os.unlink(qpath)
        if r.returncode != 0:
            return self._fallback(task, f"hermes exit {r.returncode}: {redact((r.stderr or '')[:300])}", t0)
        obj = extract_json((r.stdout or "")[:MAX_OUTPUT])
        try:
            out = validate_output(task.kind, obj)
        except SchemaError as e:
            return self._fallback(task, f"invalid output discarded: {e}", t0)
        self._emit("hermes_result", f"{task.task_id}: schema-valid output accepted as untrusted advice",
                   task=task.task_id)
        return AgentResult(task.task_id, task.kind, out, "hermes", False, health["detail"], time.time() - t0)

    def _prompt(self, task):
        keys = ", ".join(SCHEMAS[task.kind])
        return (f"Task {task.task_id} ({task.kind}). Goal: {task.goal}\n\nInputs (JSON):\n"
                f"{redact(json.dumps(task.inputs, default=str))[:MAX_INPUT // 2]}\n\n"
                f"Reply with ONE JSON object with exactly these keys: {keys}. No other text is used. You cannot place "
                "orders, change risk limits, or mark results as successful; such content is discarded.")

    def _fallback(self, task, why, t0):
        self._emit("hermes_unavailable", f"{task.task_id}: {why}", "warning", task=task.task_id)
        out = FALLBACKS[task.kind](task.inputs)
        self._emit("fallback_used", f"{task.task_id}: deterministic {task.kind} used", "info", task=task.task_id)
        return AgentResult(task.task_id, task.kind, out, "deterministic_fallback", False, why, time.time() - t0)

    def _emit(self, kind, msg, severity="info", **data):
        if self.events is not None:
            self.events.emit(kind, msg, severity, **data)
