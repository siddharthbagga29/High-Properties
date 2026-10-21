"""Controlled skill learning: candidate -> frozen regression + safety gate -> promote or reject -> version -> rollback.

A project skill is a directory with SKILL.md (Hermes-compatible front matter: name, description, version) and
policy.json (a small deterministic policy the code can evaluate). This build ships one kind, `experiment_triage`,
which decides whether an experiment report should be REJECTed, put on HOLD, or ADVANCEd to paper testing.

The regression set is frozen: its SHA-256 is pinned in regression/FROZEN.sha256 and evaluation refuses to run if the
cases change, so a learning loop cannot rewrite its own exam. Hard rules (same-bar fills and metric mismatches are
always REJECT) live in code, not in the skill. Promotion needs: the safety gate passes, every must-pass case is
right, and the score is at least the current approved version's score. Approval history keeps every version, so
rollback is a registry change, never a deletion.
"""
import difflib
import hashlib
import json
import re
import shutil
from pathlib import Path

from .. import ROOT
from ..events import now_iso, atomic_write_json

LEARN = ROOT / "agent_learning"
POLICY_KEYS = {"kind", "min_round_trips", "reject_if_test_return_le", "flag_fragile", "flag_synthetic"}
FLOORS = {"min_round_trips": 10}
FORBIDDEN = [r"live[\s_-]*(order|trading|account)", r"place[_\s]*order", r"(disable|turn\s*off|bypass)\s+(the\s+)?"
             r"(kill[\s_-]*switch|risk)", r"settings\.json", r"(raise|increase|loosen|weaken)\s+(the\s+)?(risk\s+)?limit",
             r"ignore\s+(all\s+)?(previous|prior)\s+instructions", r"curl[^\n|]*\|\s*(ba)?sh", r"rm\s+-rf",
             r"api[_\s-]?key", r"dangerously-skip-permissions", r"\bsudo\b", r"done_verified",
             r"(edit|modify|rewrite|delete)\s+(the\s+)?(regression|evaluation|tests?)"]


class SkillError(Exception):
    pass


def sha256_file(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def front_matter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise SkillError("SKILL.md needs YAML front matter")
    out = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip('"')
    for k in ("name", "description", "version"):
        if not out.get(k):
            raise SkillError(f"front matter missing {k}")
    return out


def apply_policy(policy, case):
    m = case["metrics"]
    if m.get("same_bar_fill") or m.get("metric_mismatch") or m.get("leakage"):
        return "REJECT"  # hard rule in code, not configurable by any skill
    if m["test_return"] <= policy["reject_if_test_return_le"]:
        return "REJECT"
    if m.get("synthetic") and policy["flag_synthetic"]:
        return "HOLD"
    if m["round_trips"] < policy["min_round_trips"]:
        return "HOLD"
    if m.get("fragile") and policy["flag_fragile"]:
        return "HOLD"
    return "ADVANCE"


def safety_gate(text, policy):
    problems = []
    low = text.lower()
    for pat in FORBIDDEN:
        if re.search(pat, low):
            problems.append(f"forbidden instruction pattern: {pat}")
    unknown = set(policy) - POLICY_KEYS
    if unknown:
        problems.append(f"unknown policy keys {sorted(unknown)} (skills cannot add capabilities)")
    if policy.get("kind") != "experiment_triage":
        problems.append("unsupported skill kind")
    for k, floor in FLOORS.items():
        if not isinstance(policy.get(k), int) or policy[k] < floor:
            problems.append(f"{k} below safety floor {floor}")
    if policy.get("flag_synthetic") is not True:
        problems.append("flag_synthetic must stay true: synthetic results can never advance")
    if not isinstance(policy.get("reject_if_test_return_le"), (int, float)) or policy["reject_if_test_return_le"] < 0:
        problems.append("reject_if_test_return_le must be >= 0 (losing test windows always reject)")
    if not isinstance(policy.get("flag_fragile"), bool):
        problems.append("flag_fragile must be a boolean")
    return problems


class SkillLab:
    def __init__(self, root=LEARN, events=None):
        self.root = Path(root)
        self.events = events
        self.cases_path = self.root / "regression" / "experiment_triage_cases.json"
        self.frozen_path = self.root / "regression" / "FROZEN.sha256"
        self.registry_path = self.root / "approved_skills" / "registry.json"
        self.log_path = self.root / "evaluations.jsonl"

    # -- regression set -------------------------------------------------------------------------------------------
    def cases(self):
        pinned = self.frozen_path.read_text().split()[0] if self.frozen_path.exists() else None
        if pinned is None:
            raise SkillError("regression set is not frozen (missing FROZEN.sha256)")
        if sha256_file(self.cases_path) != pinned:
            raise SkillError("regression set changed after it was frozen; evaluation refused")
        return json.loads(self.cases_path.read_text())["cases"]

    def registry(self):
        return json.loads(self.registry_path.read_text()) if self.registry_path.exists() else {}

    def _approved_dir(self, name, version):
        return self.root / "approved_skills" / name / version

    # -- evaluation -----------------------------------------------------------------------------------------------
    def evaluate(self, skill_dir):
        skill_dir = Path(skill_dir)
        text = (skill_dir / "SKILL.md").read_text()
        meta = front_matter(text)
        try:
            policy = json.loads((skill_dir / "policy.json").read_text())
        except (OSError, json.JSONDecodeError) as e:
            raise SkillError(f"policy.json unreadable: {e}")
        safety = safety_gate(text, policy)
        results, correct, must_fail = [], 0, []
        cases = self.cases()
        for c in cases:
            got = apply_policy(policy, c) if not safety else "N/A"
            ok = got == c["expected"]
            correct += ok
            if c.get("must") and not ok:
                must_fail.append(c["id"])
            results.append({"id": c["id"], "expected": c["expected"], "got": got, "ok": ok})
        return {"name": meta["name"], "version": meta["version"], "score": correct / len(cases),
                "safety": safety, "must_fail": must_fail, "results": results,
                "cases_sha256": sha256_file(self.cases_path)}

    def baseline(self, name):
        reg = self.registry().get(name)
        if not reg:
            return None, 0.0
        cur = next(h for h in reg["history"] if h["version"] == reg["current"])
        return reg["current"], cur["score"]

    def propose(self, skill_dir):
        """Evaluate a candidate and promote or reject it. Returns the decision record (also appended to the log)."""
        ev = self.evaluate(skill_dir)
        name, version = ev["name"], ev["version"]
        base_v, base_score = self.baseline(name)
        reasons = list(ev["safety"])
        if ev["must_fail"]:
            reasons.append(f"must-pass cases failed: {ev['must_fail']}")
        if ev["score"] < base_score:
            reasons.append(f"score {ev['score']:.3f} below current approved {base_v} at {base_score:.3f}")
        if base_v == version:
            reasons.append(f"version {version} already approved; bump the version")
        diff = ""
        if base_v:
            old = (self._approved_dir(name, base_v) / "SKILL.md").read_text().splitlines()
            new = (Path(skill_dir) / "SKILL.md").read_text().splitlines()
            diff = "\n".join(difflib.unified_diff(old, new, f"{name}@{base_v}", f"{name}@{version}", lineterm=""))
        decision = "promoted" if not reasons else "rejected"
        rec = {"at": now_iso(), "name": name, "version": version, "decision": decision, "reasons": reasons,
               "score": ev["score"], "baseline_version": base_v, "baseline_score": base_score,
               "cases_sha256": ev["cases_sha256"], "diff": diff[:8000],
               "evaluation_command": "python3 -m lql.cli skills propose <dir>",
               "results": ev["results"]}
        if decision == "promoted":
            dest = self._approved_dir(name, version)
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(skill_dir, dest)
            reg = self.registry()
            entry = reg.setdefault(name, {"current": None, "history": []})
            entry["history"].append({"version": version, "score": ev["score"], "at": rec["at"],
                                     "rollback_to": entry["current"]})
            entry["current"] = version
            atomic_write_json(self.registry_path, reg)
        else:
            dest = self.root / "rejected_skills" / f"{name}-{version}"
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(skill_dir, dest)
            atomic_write_json(dest / "rejection.json", {k: rec[k] for k in ("at", "reasons", "score", "results")})
        self._log(rec)
        return rec

    def rollback(self, name, by):
        if not by:
            raise SkillError("rollback needs a named operator")
        reg = self.registry()
        entry = reg.get(name)
        if not entry or not entry["current"]:
            raise SkillError(f"no approved versions of {name}")
        cur = next(h for h in entry["history"] if h["version"] == entry["current"])
        if not cur["rollback_to"]:
            raise SkillError(f"{name}@{entry['current']} has no earlier approved version")
        prev = entry["current"]
        entry["current"] = cur["rollback_to"]
        atomic_write_json(self.registry_path, reg)
        rec = {"at": now_iso(), "name": name, "decision": "rolled_back", "from": prev, "to": entry["current"],
               "by": by}
        self._log(rec)
        return rec

    def current_policy(self, name):
        reg = self.registry().get(name)
        if not reg or not reg["current"]:
            return None
        return json.loads((self._approved_dir(name, reg["current"]) / "policy.json").read_text())

    def _log(self, rec):
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.log_path, "a") as f:
            f.write(json.dumps({k: v for k, v in rec.items() if k != "results"}, sort_keys=True) + "\n")
        if self.events is not None:
            self.events.emit("skill_" + rec["decision"], f"{rec['name']} {rec.get('version', '')}: {rec['decision']}",
                             "info" if rec["decision"] != "rejected" else "warning")
