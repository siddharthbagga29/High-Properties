import unittest

from lql.orchestrator import TaskGraph, Supervisor, TaskError
from tests.helpers import tmpdir

GOOD = {"command": "python3 -m unittest tests.test_risk", "exit_code": 0, "passed": 9, "failed": 0}


class TaskGraphTests(unittest.TestCase):
    def setUp(self):
        self.path = tmpdir() / "state.json"
        self.g = TaskGraph(self.path)
        self.g.add("A", "first", "engineer")
        self.g.add("B", "second", "engineer", deps=["A"])

    def test_only_supervisor_with_evidence_can_verify(self):
        tid = self.g.select_ready()
        self.assertEqual(tid, "A")
        self.g.start("A", "build")
        with self.assertRaises(TaskError):
            self.g.verify("A", "worker", GOOD)
        with self.assertRaises(TaskError):
            self.g.verify("A", "supervisor", {"command": "trust me", "exit_code": 0})
        with self.assertRaises(TaskError):
            self.g.verify("A", "supervisor", dict(GOOD, exit_code=1))
        self.g.verify("A", "supervisor", GOOD)
        self.assertEqual(self.g.get("A")["status"], "done_verified")
        self.assertEqual(self.g.select_ready(), "B")

    def test_three_identical_failures_block(self):
        g = TaskGraph(tmpdir() / "s.json")
        g.add("X", "flaky", "engineer", retry_budget=5)
        for _ in range(3):
            self.assertEqual(g.select_ready(), "X")
            g.start("X", "try")
            g.record_failure("X", "ImportError: foo")
        self.assertEqual(g.get("X")["status"], "blocked_external")
        self.assertEqual(g.get("X")["blocker"]["kind"], "identical_failure_x3")
        self.assertIsNone(g.select_ready())

    def test_state_persists_and_restart_continues(self):
        self.g.select_ready()
        self.g.start("A", "build")
        again = TaskGraph(self.path)
        self.assertEqual(again.get("A")["status"], "in_progress")
        again.add("A", "duplicate add is ignored", "x")
        self.assertEqual(again.get("A")["goal"], "first")
        self.assertIsNotNone(again.state["last_checkpoint"])

    def test_supervisor_cycle_with_critic(self):
        sup = Supervisor(self.g)
        tid = sup.cycle(lambda t: {}, lambda t, e: GOOD, lambda t, e: ["leakage found"])
        self.assertEqual(self.g.get(tid)["status"], "rejected_by_critic")
        tid = sup.cycle(lambda t: {}, lambda t, e: GOOD, lambda t, e: [])
        self.assertEqual(self.g.get(tid)["status"], "done_verified")
        tid = sup.cycle(lambda t: 1 / 0, lambda t, e: GOOD, lambda t, e: [])
        self.assertEqual(self.g.get(tid)["status"], "failed")

    def test_human_gate(self):
        self.g.needs_human("A", "approve installing Hermes on the Mac")
        self.assertEqual(self.g.get("A")["status"], "needs_human")
        self.assertIsNone(self.g.select_ready())
