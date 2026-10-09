"""Tests for the Jarvis auditor (tools/audit.py) and the revenue/export additions to tools/graph.py.

Run: python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'
Every test works in a temporary directory; nothing in the real record is written.
"""
import contextlib
import datetime
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import audit  # noqa: E402
import graph  # noqa: E402

NOW = datetime.datetime(2026, 10, 8, 12, 0, 0, tzinfo=datetime.timezone.utc)
SCORECARD_KEYS = {"agent", "name", "score", "grade", "meetsInstitutionalBar", "dimensions", "findings", "computedAt"}
DIMENSION_KEYS = {"id", "label", "weight", "score", "basis"}
FINDING_REQUIRED = {"id", "agent", "severity", "kind", "claim", "evidence", "status"}
FINDING_ALLOWED = FINDING_REQUIRED | {"task"}


def jl(rows):
    return "".join(json.dumps(r) + "\n" for r in rows)


def act(t, kind, text, src="self", actor=None, node="X"):
    r = {"t": t, "node": node, "agent": "x", "kind": kind, "text": text, "src": src}
    if actor:
        r["actor"] = actor
    return r


def build_fixture(root):
    """A small record with known numbers. Expected scores are worked out in FixtureScores below."""
    pe = root / "perspective-engine"
    (pe / "graph" / "activity").mkdir(parents=True)
    (pe / "graph" / "audit" / "findings").mkdir(parents=True)
    (pe / "out").mkdir()
    (pe / "dashboard").mkdir()
    (pe / "city" / "public").mkdir(parents=True)
    agents = {
        "orchestrator": {"name": "Mayor", "district": "Hall", "role": "runs the graph"},
        "alpha": {"name": "Ann", "district": "A", "role": "a"},
        "beta": {"name": "Bob", "district": "B", "role": "b"},
        "gamma": {"name": "Gus", "district": "G", "role": "g"},
        "delta": {"name": "Dee", "district": "D", "role": "d"},
    }

    def node(i, agent, status, outputs, budget=0, run=None, gate=None, deps=()):
        n = {"id": i, "phase": 0, "agent": agent, "title": f"task {i}", "deps": list(deps), "outputs": outputs,
             "accept": ["it works"], "gate": gate, "budget_k": budget, "status": status}
        if run:
            n["run"] = run
        return n

    nodes = [
        node("O1", "orchestrator", "done", ["perspective-engine/out/o1.md"]),
        node("A1", "alpha", "done", ["perspective-engine/out/a1.md"], budget=10, run={"used_k": 60}),
        node("A2", "alpha", "awaiting_human", ["perspective-engine/out/a2.md"], budget=20, run={"used_k": 135},
             gate={"reason": "founder sends"}),
        node("A3", "alpha", "pending", ["perspective-engine/out/a3.md"]),
        node("B1", "beta", "done", ["perspective-engine/out/b1.md"]),
        node("G1", "gamma", "running", ["perspective-engine/out/g1.md"]),
        node("D1", "delta", "done", ["perspective-engine/out/d1.md"], budget=30, run={"used_k": 90}),
    ]
    g = {"project": "Fixture", "north_star": "test", "version": 1, "agents": agents, "nodes": nodes}
    (pe / "graph" / "graph.json").write_text(json.dumps(g, indent=1))

    ledger = [
        {"t": "2026-10-06T09:00:00Z", "event": "start", "node": "O1", "note": ""},
        {"t": "2026-10-06T09:00:00Z", "event": "done", "node": "O1", "note": "plan written"},
        {"t": "2026-10-06T10:00:00Z", "event": "start", "node": "A1", "note": ""},
        {"t": "2026-10-06T10:30:00Z", "event": "done", "node": "A1", "note": "verified"},
        {"t": "2026-10-06T11:00:00Z", "event": "start", "node": "A2", "note": ""},
        {"t": "2026-10-06T11:50:00Z", "event": "block", "node": "A2", "note": "Verification round 2 failed: summary too long"},
        {"t": "2026-10-06T11:50:00Z", "event": "unblock", "node": "A2", "note": "round 3 limited to the gap"},
        {"t": "2026-10-06T11:51:00Z", "event": "start", "node": "A2", "note": ""},
        {"t": "2026-10-06T12:30:00Z", "event": "done", "node": "A2", "note": "verified; awaits founder"},
        {"t": "2026-10-06T13:00:00Z", "event": "start", "node": "B1", "note": ""},
        {"t": "2026-10-06T13:20:00Z", "event": "done", "node": "B1", "note": "list built"},
        {"t": "2026-10-08T11:00:00Z", "event": "start", "node": "G1", "note": ""},
        {"t": "2026-10-06T14:00:00Z", "event": "start", "node": "D1", "note": ""},
        {"t": "2026-10-06T14:30:00Z", "event": "done", "node": "D1", "note": "verified"},
    ]
    (pe / "graph" / "ledger.jsonl").write_text(jl(ledger))

    a = pe / "graph" / "activity"
    (a / "A1.jsonl").write_text(jl([
        act("2026-10-06T10:00:00Z", "plan", "start", src="ledger", node="A1"),
        act("2026-10-06T10:05:00Z", "plan", "Plan the memo", node="A1"),
        act("2026-10-06T10:10:00Z", "write", "Wrote out/a1.md", src="transcript", node="A1"),
        act("2026-10-06T10:25:00Z", "check", "Verifier: acceptance PASS", actor="verifier", node="A1"),
    ]))
    (a / "A2.jsonl").write_text(jl([
        act("2026-10-06T11:05:00Z", "write", "Wrote out/a2.md", node="A2"),
        act("2026-10-06T11:10:00Z", "check", "Verifier FAIL: summary 170 words (cap 150)", actor="verifier", node="A2"),
        act("2026-10-06T11:20:00Z", "edit", "Edited out/a2.md", node="A2"),
        act("2026-10-06T11:30:00Z", "check", "Verifier GAP: the summary's 40% figure is false", actor="verifier", node="A2"),
        act("2026-10-06T11:40:00Z", "note", "Build interrupted by the usage limit at 11:40 UTC", node="A2"),
        act("2026-10-06T12:00:00Z", "edit", "Edited out/a2.md", node="A2"),
        act("2026-10-06T12:20:00Z", "check", "Verifier: all criteria PASS", actor="verifier", node="A2"),
        act("2026-10-06T12:20:01Z", "check", "Non-blocking: typo in row 3", actor="verifier", node="A2"),
    ]))
    (a / "B1.jsonl").write_text(jl([
        act("2026-10-06T13:05:00Z", "read", "Read brief", src="transcript", node="B1"),
        act("2026-10-06T13:10:00Z", "write", "Wrote out/b1.md", src="transcript", node="B1"),
        act("2026-10-08T09:00:00Z", "edit", "Orchestrator: corrected 3 present-tense advisor claims", node="B1"),
    ]))
    (a / "G1.jsonl").write_text(jl([act("2026-10-08T11:05:00Z", "write", "Wrote out/g1.md", node="G1")]))
    (a / "D1.jsonl").write_text(jl([
        act("2026-10-06T14:05:00Z", "write", "Wrote out/d1.md", node="D1"),
        act("2026-10-06T14:25:00Z", "check", "Verifier: every criterion PASS", actor="verifier", node="D1"),
    ]))

    out = pe / "out"
    (out / "o1.md").write_text("# Plan\n\nThree hypotheses tested over 6 months (assumption).\n")
    (out / "a1.md").write_text(
        "# Memo\n\n## Summary\nRevenue grew 12% in 2025 (https://example.org/report).\n\n"
        "We have 40 customers.\n\nThe price is $500 [U].\n\nCosts below are assumptions.\n\n"
        "| Item | Value |\n|---|---|\n| seats | 30 users |\n"
    )
    (out / "a2.md").write_text("# Notes\n\nPlain text with no figures at all.\n")
    (out / "b1.md").write_text("# List\n\nCosts are $1,000 per seat.\n\nTeams have 12 managers.\n")
    (out / "d1.md").write_text("# Pilot\n\nFee is $2,000 per pilot [S].\n\nUptake 25% (assumption).\n")

    (pe / "graph" / "audit" / "findings" / "llm-1.json").write_text(json.dumps({
        "auditedAgents": ["alpha", "delta"],
        "findings": [
            {"id": "F-1", "agent": "Ann", "task": "A1", "severity": "major", "kind": "unsupported_claim",
             "claim": "40 customers", "evidence": "no source in out/a1.md", "status": "open"},
            {"id": "F-2", "agent": "delta", "task": "D1", "severity": "critical", "kind": "process",
             "claim": "pilot fee sent to a buyer", "evidence": "outbox shows a sent email", "status": "open"},
            {"id": "F-3", "agent": "alpha", "severity": "major", "kind": "error", "claim": "no evidence given",
             "evidence": "", "status": "open"},
            {"id": "F-4", "agent": "alpha", "task": "A1", "severity": "minor", "kind": "hallucination",
             "claim": "a quote", "evidence": "quote not in source", "status": "fixed"},
            {"id": "AF-alpha-checked", "agent": "alpha", "severity": "minor", "kind": "process",
             "claim": "checked", "evidence": "the 12% figure matches the cited report", "status": "accepted"},
        ],
    }))
    (pe / "graph" / "revenue.jsonl").write_text(jl([
        {"t": "2026-10-07T10:00:00Z", "amountUsd": 1500, "payer": "Acme", "evidence": "INV-1", "recordedBy": "founder"},
        {"t": "2026-10-07T11:00:00Z", "amountUsd": 900, "payer": "Beta Co", "evidence": "", "recordedBy": "founder"},
    ]))
    return pe


class Tmp(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self._td.name)

    def tearDown(self):
        self._td.cleanup()


class GradeBands(unittest.TestCase):
    def test_bands(self):
        cases = [(100, "A"), (90, "A"), (89.9, "B"), (80, "B"), (79.9, "C"), (70, "C"), (69.9, "D"),
                 (60, "D"), (59.9, "F"), (0, "F")]
        for score, want in cases:
            self.assertEqual(audit.grade(score), want, score)

    def test_weights_sum_to_100_and_ids_unique(self):
        self.assertEqual(sum(w for _, _, w in audit.DIMENSIONS), 100)
        self.assertEqual(len(set(audit.DIM_IDS)), len(audit.DIM_IDS))
        self.assertTrue(7 <= len(audit.DIMENSIONS) <= 8)


class EvidenceDetection(Tmp):
    def test_claims_and_markers(self):
        p = self.root / "x.md"
        p.write_text(
            "# Heading 42%\n\n"
            "Sales rose 12% (https://example.org).\n\n"   # traced by URL
            "We serve 40 customers.\n\n"                   # untraced
            "Price $500 [U].\n\n"                          # traced by tag
            "See section 4.2 and V03 on 2026-10-07.\n\n"   # no numeric claim
            "Summary: 40 customers again.\n\n"             # still untraced (no marked line has it)
            "```\nresult 99%\n```\n"                       # code block ignored
        )
        total, traced, untraced = audit.evidence_for_file(p)
        self.assertEqual((total, traced), (4, 2))
        self.assertEqual(untraced, ["40 customers", "40 customers"])

    def test_restatement_and_caption(self):
        p = self.root / "y.md"
        p.write_text(
            "## Summary\nAbout 12 minutes per survey.\n\n"
            "Burden: 12 min per survey (preregistration.md).\n\n"
            "Inputs are assumptions:\n\n| a | b |\n|---|---|\n| seats | 30 users |\n"
        )
        total, traced, _ = audit.evidence_for_file(p)
        self.assertEqual((total, traced), (3, 3))


class FixtureScores(Tmp):
    """Known record -> known scores. Each expected value is derived by hand in the comments."""

    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        self.result = audit.compute(self.pe, NOW)
        self.cards = {c["agent"]: c for c in self.result["scorecards"]}

    def dims(self, agent):
        return {d["id"]: d["score"] for d in self.cards[agent]["dimensions"]}

    def test_shape_matches_contract(self):
        r = self.result
        self.assertEqual(r["rubricVersion"], audit.RUBRIC_VERSION)
        self.assertEqual(r["computedAt"], "2026-10-08T12:00:00Z")
        self.assertEqual(set(self.cards), {"orchestrator", "alpha", "beta", "gamma", "delta"})
        for c in r["scorecards"]:
            self.assertEqual(set(c), SCORECARD_KEYS)
            self.assertIsInstance(c["score"], (int, float))
            self.assertIn(c["grade"], "ABCDF")
            self.assertIsInstance(c["meetsInstitutionalBar"], bool)
            self.assertEqual(c["computedAt"], r["computedAt"])
            self.assertEqual([d["id"] for d in c["dimensions"]], audit.DIM_IDS)
            self.assertEqual(sum(d["weight"] for d in c["dimensions"]), 100)
            for d in c["dimensions"]:
                self.assertEqual(set(d), DIMENSION_KEYS)
                self.assertTrue(0 <= d["score"] <= 100)
                self.assertTrue(d["basis"].strip())
            for f in c["findings"]:
                self.assertTrue(FINDING_REQUIRED <= set(f) <= FINDING_ALLOWED, f)
                self.assertIn(f["severity"], ("critical", "major", "minor"))
                self.assertIn(f["kind"], ("hallucination", "unsupported_claim", "incomplete", "error", "process"))
                self.assertIn(f["status"], ("open", "fixed", "accepted"))
            expected = round(sum(d["weight"] * d["score"] for d in c["dimensions"]) / 100, 1)
            self.assertAlmostEqual(c["score"], expected, places=6)
            self.assertEqual(c["grade"], audit.grade(c["score"]))
        json.dumps(r)  # serialisable

    def test_alpha(self):
        d = self.dims("alpha")
        # A1 first pass; A2 failed twice (2 FAIL/GAP clusters split by an edit; block note says round 2) -> 1/2.
        self.assertEqual(d["first_pass_yield"], 50.0)
        # 2 rounds over 2 tasks = 1.0/task -> -30; 1 open non-blocking note (after the last edit) -> -3.
        self.assertEqual(d["effective_challenge"], 67.0)
        # a1.md: 12% (URL), $500 ([U]), 30 users (caption "assumptions") traced; 40 customers not -> 3/4.
        # (3 + 5*0.7) / (4 + 5) = 72.2; open major unsupported_claim finding F-1 -> -6.
        self.assertEqual(d["evidence"], 66.2)
        # One verifier row naming a false statement -> -5; alpha is covered by an LLM audit, so no 85 cap.
        self.assertEqual(d["integrity"], 95.0)
        self.assertEqual(d["process"], 100.0)
        self.assertEqual(d["gates"], 100.0)
        # A1 60k within 10+70; A2 135k vs 20+70 = 1.5x -> 50; mean 75.
        self.assertEqual(d["budget"], 75.0)
        # One usage-limit interruption -> -8.
        self.assertEqual(d["reliability"], 92.0)
        c = self.cards["alpha"]
        # (20*50 + 15*67 + 15*66.2 + 20*95 + 15*100 + 5*100 + 5*75 + 5*92) / 100 = 77.33
        self.assertEqual(c["score"], 77.3)
        self.assertEqual(c["grade"], "C")
        self.assertFalse(c["meetsInstitutionalBar"])
        self.assertEqual([f["id"] for f in c["findings"]], ["F-1", "F-4"])  # F-3 has no evidence: skipped
        self.assertTrue(any("F-3" in w and "no evidence" in w for w in self.result["warnings"]))
        basis = {x["id"]: x["basis"] for x in c["dimensions"]}
        self.assertIn("A2 (2 failed rounds, 1 blocks", basis["first_pass_yield"])
        self.assertIn("A1 a1.md 3/4", basis["evidence"])
        self.assertIn("A2 135k vs 20k", basis["budget"])

    def test_beta(self):
        d = self.dims("beta")
        self.assertEqual(d["first_pass_yield"], audit.NEUTRAL)  # B1 has no verification record
        self.assertEqual(d["effective_challenge"], audit.NEUTRAL)
        # b1.md: $1,000 and 12 managers, both untraced -> (0 + 3.5) / (2 + 5) = 50.
        self.assertEqual(d["evidence"], 50.0)
        # One orchestrator correction of a false claim -> 80 (under the 85 cap).
        self.assertEqual(d["integrity"], 80.0)
        self.assertEqual(d["process"], 25.0)  # steps recorded, no verifier rows
        self.assertEqual(d["gates"], audit.NEUTRAL)
        self.assertEqual(d["budget"], audit.NEUTRAL)
        self.assertEqual(d["reliability"], 100.0)
        # 20*70 + 15*70 + 15*50 + 20*80 + 15*25 + 5*70 + 5*70 + 5*100 = 6375 -> 63.75 -> rounded to 1 dp
        self.assertAlmostEqual(self.cards["beta"]["score"], 63.75, delta=0.051)
        self.assertEqual(self.cards["beta"]["grade"], "D")
        basis = {x["id"]: x["basis"] for x in self.cards["beta"]["dimensions"]}
        self.assertTrue(basis["first_pass_yield"].startswith("No data:"))
        self.assertIn("B1 on 2026-10-08", basis["integrity"])

    def test_mayor(self):
        d = self.dims("orchestrator")
        self.assertEqual(d["evidence"], 75.0)  # 6 months (assumption): (1 + 3.5) / (1 + 5)
        self.assertEqual(d["integrity"], 85.0)  # O1 self-verified -> 90, capped at 85 (not LLM-audited)
        # own O1: nothing recorded -> 0; graph-wide 3/5 closures verified (A1 A2 D1 of O1 A1 A2 B1 D1) -> 60;
        # 0.5*0 + 0.5*60 = 30; rewrote B1 -> -10 = 20; open critical AUTO-REV-2 -> -15 = 5.
        self.assertEqual(d["process"], 5.0)
        self.assertEqual(d["reliability"], 80.0)  # G1 stalled anywhere in the graph -> -20
        c = self.cards["orchestrator"]
        self.assertEqual([f["id"] for f in c["findings"]], ["AUTO-REV-2"])
        self.assertEqual(c["findings"][0]["severity"], "critical")
        self.assertFalse(c["meetsInstitutionalBar"])
        # 20*70 + 15*70 + 15*75 + 20*85 + 15*5 + 5*70 + 5*70 + 5*80 = 6450 -> 64.5
        self.assertEqual(c["score"], 64.5)
        self.assertEqual(c["grade"], "D")
        self.assertEqual(self.result["revenueCheck"]["entries"], 2)
        self.assertEqual(self.result["revenueCheck"]["verified"], 1)
        self.assertEqual(self.result["revenueCheck"]["flagged"][0]["entry"], 2)

    def test_gamma_neutral_and_stalled(self):
        d = self.dims("gamma")
        self.assertEqual(d["reliability"], 80.0)
        self.assertEqual(d["evidence"], audit.NEUTRAL)
        self.assertEqual(d["integrity"], 85.0)
        # 20*70 + 15*70 + 15*70 + 20*85 + 15*70 + 5*70 + 5*70 + 5*80 = 7350
        self.assertEqual(self.cards["gamma"]["score"], 73.5)

    def test_open_critical_blocks_the_bar_despite_a_high_score(self):
        c = self.cards["delta"]
        d = self.dims("delta")
        self.assertEqual(d["process"], 85.0)  # 100 - 15 (critical, open)
        self.assertEqual(d["integrity"], 100.0)  # covered by the LLM audit: no cap
        self.assertGreaterEqual(c["score"], 80)
        self.assertEqual(c["grade"], "A")
        self.assertFalse(c["meetsInstitutionalBar"])

    def test_bar_met_without_critical(self):
        (self.pe / "graph" / "audit" / "findings" / "llm-1.json").write_text(json.dumps({"auditedAgents": ["delta"], "findings": []}))
        cards = {c["agent"]: c for c in audit.compute(self.pe, NOW)["scorecards"]}
        self.assertGreaterEqual(cards["delta"]["score"], 80)
        self.assertTrue(cards["delta"]["meetsInstitutionalBar"])

    def test_missing_optional_inputs(self):
        import shutil
        shutil.rmtree(self.pe / "graph" / "audit")
        shutil.rmtree(self.pe / "graph" / "activity")
        (self.pe / "graph" / "revenue.jsonl").unlink()
        r = audit.compute(self.pe, NOW)
        self.assertEqual(r["revenueCheck"]["entries"], 0)
        self.assertEqual(r["inputs"]["llmFindings"], 0)
        for c in r["scorecards"]:
            self.assertEqual(set(c), SCORECARD_KEYS)
            self.assertEqual(c["findings"], [])
            self.assertLessEqual({d["id"]: d["score"] for d in c["dimensions"]}["integrity"], 85.0)

    def test_write_is_deterministic(self):
        out = audit.write(self.result, self.pe)
        first = out.read_text()
        audit.write(audit.compute(self.pe, NOW), self.pe)
        self.assertEqual(out.read_text(), first)
        self.assertEqual(json.loads(first)["scorecards"][0]["agent"], "orchestrator")


@contextlib.contextmanager
def graph_paths(root):
    pe = root / "perspective-engine"
    with mock.patch.multiple(
        graph, ROOT=root, PE=pe, GRAPH=pe / "graph" / "graph.json", LEDGER=pe / "graph" / "ledger.jsonl",
        ACTIVITY=pe / "graph" / "activity", LOCK=pe / "graph" / ".lock", STATE_JS=pe / "dashboard" / "state.js",
        CITY_JSON=pe / "city" / "public" / "state.json", REVENUE=pe / "graph" / "revenue.jsonl",
        AUDIT_JSON=pe / "graph" / "audit" / "scorecards.json", SIGNERS=pe / "graph" / "founder.allowed_signers",
        FOUNDER_AUTH=pe / "graph" / "founder-auth.jsonl",
    ):
        yield pe


def run_graph(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = graph.main(list(argv))
    return rc, buf.getvalue()


class FindingAccounting(Tmp):
    """Positive 'checked' notes never deduct; a missing-verifier finding is not deducted on top of the metric."""

    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)

    def test_checked_note_is_kept_but_never_scored(self):
        r = audit.compute(self.pe, NOW)
        alpha = next(c for c in r["scorecards"] if c["agent"] == "alpha")
        self.assertNotIn("AF-alpha-checked", [f["id"] for f in alpha["findings"]])
        self.assertEqual(r["checks"]["alpha"], ["the 12% figure matches the cited report"])

    def test_missing_verifier_finding_is_listed_not_double_counted(self):
        before = audit.compute(self.pe, NOW)
        p = self.pe / "graph" / "audit" / "findings" / "llm-2.json"
        p.write_text(json.dumps([{"id": "F-9", "agent": "delta", "task": "D1", "severity": "major", "kind": "process",
                                  "claim": "D1 closed", "evidence": "no verifier check entry in the activity log",
                                  "status": "open"}]))
        after = audit.compute(self.pe, NOW)
        card = lambda r: next(c for c in r["scorecards"] if c["agent"] == "delta")
        self.assertIn("F-9", [f["id"] for f in card(after)["findings"]])
        self.assertEqual(card(before)["score"], card(after)["score"])
        proc = next(d for d in card(after)["dimensions"] if d["id"] == "process")
        self.assertIn("not deducted twice", proc["basis"])
        p.write_text(json.dumps([{"id": "F-9", "agent": "delta", "task": "D1", "severity": "major", "kind": "process",
                                  "claim": "D1 says co-designed", "evidence": "no advisor exists", "status": "open"}]))
        self.assertLess(card(audit.compute(self.pe, NOW))["score"], card(before)["score"])


class RevenueCommand(Tmp):
    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        (self.pe / "graph" / "revenue.jsonl").unlink()
        self.ctx = graph_paths(self.root)
        self.ctx.__enter__()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        super().tearDown()

    def revenue_lines(self):
        p = self.pe / "graph" / "revenue.jsonl"
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def test_refusals_write_nothing(self):
        bad = [
            ("revenue", "add", "1500", "Acme", "--evidence", "INV-1"),                 # no --founder
            ("revenue", "add", "1500", "Acme", "--founder"),                          # no evidence
            ("revenue", "add", "1500", "Acme", "--evidence", "  ", "--founder"),      # blank evidence
            ("revenue", "add", "1500", "Acme", "--founder", "--evidence"),            # evidence flag without value
            ("revenue", "add", "0", "Acme", "--evidence", "INV-1", "--founder"),      # zero
            ("revenue", "add", "-5", "Acme", "--evidence", "INV-1", "--founder"),     # negative
            ("revenue", "add", "abc", "Acme", "--evidence", "INV-1", "--founder"),    # not a number
            ("revenue", "add", "nan", "Acme", "--evidence", "INV-1", "--founder"),
            ("revenue", "add", "inf", "Acme", "--evidence", "INV-1", "--founder"),
            ("revenue", "add", "100", "", "--evidence", "INV-1", "--founder"),        # empty payer
            ("revenue", "add", "100", "--evidence", "INV-1", "--founder"),            # payer missing
            ("revenue", "add", "100", "Acme", "--evidence", "INV-1", "--founder", "--force"),  # unknown option
            ("revenue", "remove"),
        ]
        for argv in bad:
            rc, out = run_graph(*argv)
            self.assertEqual(rc, 1, argv)
            self.assertEqual(self.revenue_lines(), [], argv)

    def test_add_and_list(self):
        rc, out = run_graph("revenue", "add", "1,500", "Acme Corp", "--evidence", "invoice INV-1", "--founder")
        self.assertEqual(rc, 0, out)
        rc, _ = run_graph("revenue", "add", "$250.5", "Beta", "--founder", "--evidence=stripe ch_123")
        self.assertEqual(rc, 0)
        rows = self.revenue_lines()
        self.assertEqual(len(rows), 2)
        self.assertEqual(set(rows[0]), {"t", "amountUsd", "payer", "evidence", "recordedBy", "auth"})
        self.assertEqual(rows[0]["auth"], "attested")  # no founder key registered in this fixture
        self.assertEqual(rows[0]["amountUsd"], 1500.0)
        self.assertEqual(rows[0]["payer"], "Acme Corp")
        self.assertEqual(rows[0]["evidence"], "invoice INV-1")
        self.assertEqual(rows[0]["recordedBy"], "founder")
        self.assertEqual(rows[1]["amountUsd"], 250.5)
        self.assertEqual(rows[1]["evidence"], "stripe ch_123")
        self.assertIsNotNone(audit.parse_time(rows[0]["t"]))
        rc, out = run_graph("revenue", "list")
        self.assertEqual(rc, 0)
        self.assertIn("Acme Corp", out)
        self.assertIn("2 entries, $1,750.50 total, 2 payers", out)
        # the auditor accepts both entries
        self.assertEqual(audit.check_revenue(self.pe, [])["verified"], 2)

    def test_list_empty(self):
        rc, out = run_graph("revenue", "list")
        self.assertEqual((rc, out.strip()), (0, "no revenue recorded"))


class ExportCarriesAuditAndRevenue(Tmp):
    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        audit.write(audit.compute(self.pe, NOW), self.pe)
        self.ctx = graph_paths(self.root)
        self.ctx.__enter__()

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        super().tearDown()

    def states(self):
        js = (self.pe / "dashboard" / "state.js").read_text()
        self.assertTrue(js.startswith("window.PE_STATE = "))
        dash = json.loads(js[len("window.PE_STATE = "):].rstrip().rstrip(";"))
        city = json.loads((self.pe / "city" / "public" / "state.json").read_text())
        return dash, city

    def test_export_contains_audit_and_revenue(self):
        rc, _ = run_graph("export")
        self.assertEqual(rc, 0)
        dash, city = self.states()
        for s in (dash, city):
            self.assertEqual(len(s["revenue"]), 2)
            self.assertEqual(s["revenue"][0]["payer"], "Acme")
            self.assertEqual(s["audit"]["rubricVersion"], audit.RUBRIC_VERSION)
            self.assertEqual(len(s["audit"]["scorecards"]), 5)
            for k in ("nodes", "ledger", "agents", "project"):
                self.assertIn(k, s)
        self.assertIn("activity", city)
        self.assertIn("excerpts", city)
        self.assertEqual(len(city["ledger"]), 14)

    def test_export_without_audit_or_revenue(self):
        (self.pe / "graph" / "audit" / "scorecards.json").unlink()
        (self.pe / "graph" / "revenue.jsonl").unlink()
        run_graph("export")
        dash, city = self.states()
        self.assertIsNone(city["audit"])
        self.assertEqual(city["revenue"], [])
        self.assertIsNone(dash["audit"])

    def test_trim_activity_first_never_audit_or_revenue(self):
        rows = [act(f"2026-10-06T10:{i // 60:02d}:{i % 60:02d}Z", "run", f"step {i} " + "x" * 200, node="A1") for i in range(150)]
        with (self.pe / "graph" / "activity" / "A1.jsonl").open("a") as f:
            f.write(jl(rows))
        graph.export(graph.load())
        _, full = self.states()
        full_size = len(json.dumps(full, separators=(",", ":")))
        self.assertGreater(len(full["activity"]["A1"]), 120)
        # A cap that only trimming activity can meet.
        with mock.patch.object(graph, "MAX_STATE_BYTES", full_size - 20_000):
            graph.export(graph.load())
        _, city = self.states()
        self.assertLessEqual(len(json.dumps(city, separators=(",", ":"))), full_size - 20_000)
        self.assertLess(len(city["activity"]["A1"]), 120)
        self.assertEqual(len(city["ledger"]), 14)  # ledger untouched: activity was enough
        self.assertEqual(city["audit"]["scorecards"], full["audit"]["scorecards"])
        self.assertEqual(city["revenue"], full["revenue"])
        # A cap nothing can meet: audit and revenue still survive whole.
        with mock.patch.object(graph, "MAX_STATE_BYTES", 1_000):
            graph.export(graph.load())
        _, tiny = self.states()
        self.assertEqual(tiny["activity"], {})
        self.assertEqual(len(tiny["ledger"]), 14)  # under 40 entries, so the window keeps all
        self.assertEqual(tiny["audit"]["scorecards"], full["audit"]["scorecards"])
        self.assertEqual(tiny["revenue"], full["revenue"])


class RealRecord(unittest.TestCase):
    """Read-only run over the real record: it must compute without error and keep the contract shape."""

    def test_real_record(self):
        if not (audit.PE_DEFAULT / "graph" / "graph.json").exists():
            self.skipTest("no real graph")
        r = audit.compute(audit.PE_DEFAULT, NOW)
        g = json.loads((audit.PE_DEFAULT / "graph" / "graph.json").read_text())
        self.assertEqual([c["agent"] for c in r["scorecards"]], list(g["agents"]))
        for c in r["scorecards"]:
            self.assertEqual(set(c), SCORECARD_KEYS)
            for d in c["dimensions"]:
                self.assertEqual(set(d), DIMENSION_KEYS)


if __name__ == "__main__":
    unittest.main()
