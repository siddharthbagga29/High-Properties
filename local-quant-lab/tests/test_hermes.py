import json
import subprocess
import unittest

from lql.agents.hermes_adapter import HermesAdapter, TaskContract, validate_output, SchemaError, extract_json, safe_env
from lql.events import EventLog
from tests.helpers import tmpdir


class FakeRunner:
    def __init__(self, stdout="", rc=0, exc=None):
        self.stdout, self.rc, self.exc, self.calls = stdout, rc, exc, []

    def __call__(self, cmd, **kw):
        self.calls.append((cmd, kw))
        if cmd[-1] == "--version":
            return subprocess.CompletedProcess(cmd, 0, "Hermes Agent v0.test", "")
        if self.exc:
            raise self.exc
        return subprocess.CompletedProcess(cmd, self.rc, self.stdout, "")


TASK = TaskContract("t1", "propose_experiments", "propose", {"tried_params": [{"fast": 50, "slow": 200}]}, timeout_s=5)


class HermesTests(unittest.TestCase):
    def setUp(self):
        self.d = tmpdir()
        self.log = EventLog(self.d / "e.jsonl")

    def adapter(self, runner, exe="/usr/bin/hermes-fake"):
        return HermesAdapter(executable=exe, events=self.log, runner=runner, lock_path=self.d / "h.lock")

    def test_missing_hermes_uses_logged_fallback(self):
        a = HermesAdapter(executable=None, events=self.log, lock_path=self.d / "h.lock")
        a.executable = None
        r = a.run(TASK)
        self.assertEqual(r.source, "deterministic_fallback")
        self.assertFalse(r.trusted)
        self.assertNotIn({"fast": 50, "slow": 200}, [p["params"] for p in r.output["proposals"]])
        kinds = [e["kind"] for e in self.log.read()]
        self.assertIn("hermes_unavailable", kinds)
        self.assertIn("fallback_used", kinds)

    def test_valid_output_accepted_as_untrusted(self):
        out = {"proposals": [{"strategy": "sma_trend", "params": {"fast": 20, "slow": 100}, "hypothesis": "h"}],
               "rationale": "r"}
        run = FakeRunner("thinking...\n" + json.dumps(out))
        r = self.adapter(run).run(TASK)
        self.assertEqual(r.source, "hermes")
        self.assertFalse(r.trusted)
        cmd = run.calls[-1][0]
        self.assertEqual(cmd[1:3], ["chat", "--query-file"])

    def test_invalid_or_dangerous_output_discarded(self):
        bad = {"proposals": [], "rationale": "x", "place_order": {"side": "BUY", "qty": 1e9}}
        r = self.adapter(FakeRunner(json.dumps(bad))).run(TASK)
        self.assertEqual(r.source, "deterministic_fallback")
        self.assertIn("unexpected fields", r.detail)
        r = self.adapter(FakeRunner(json.dumps({"proposals": [{"strategy": "rm -rf", "params": {}, "hypothesis": ""}],
                                                "rationale": ""}))).run(TASK)
        self.assertEqual(r.source, "deterministic_fallback")

    def test_timeout_and_nonzero_exit_fall_back(self):
        r = self.adapter(FakeRunner(exc=subprocess.TimeoutExpired("hermes", 5))).run(TASK)
        self.assertIn("timed out", r.detail)
        r = self.adapter(FakeRunner(rc=3)).run(TASK)
        self.assertIn("exit 3", r.detail)

    def test_single_writer_lock(self):
        import fcntl
        with open(self.d / "h.lock", "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            r = self.adapter(FakeRunner("{}")).run(TASK)
        self.assertIn("one writer per profile", r.detail)

    def test_secrets_not_passed_to_subprocess(self):
        import os
        os.environ["BROKER_API_KEY"] = "sk-should-not-leak"
        try:
            self.assertNotIn("BROKER_API_KEY", safe_env())
        finally:
            del os.environ["BROKER_API_KEY"]

    def test_schema_helpers(self):
        self.assertEqual(extract_json('a {"x": 1} b {"summary": "s"}'), {"summary": "s"})
        with self.assertRaises(SchemaError):
            validate_output("diagnose_failure", {"likely_cause": "a", "next_step": "b", "confidence": "certain"})

    def test_hermes_has_no_order_or_risk_route(self):
        import ast
        import lql.agents.hermes_adapter as h
        with open(h.__file__) as fh:
            tree = ast.parse(fh.read())
        mods = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        self.assertFalse(mods & {"risk", "execution", "config", "execution.ledger", "execution.paper"}, mods)
        self.assertFalse(names & {"RiskEngine", "Ledger", "PaperSession", "tighten", "OrderIntent"}, names)
