"""Rules tools/graph.py enforces on state changes: done needs an independent verifier check after the last change,
block and unblock only from sensible states, and long activity text is never cut silently.

Run: python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'
"""
import json
import unittest

from test_audit import Tmp, build_fixture, graph_paths, run_graph
import graph


class GraphRules(Tmp):
    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        self.ctx = graph_paths(self.root)
        self.ctx.__enter__()
        # G1 is running and its output exists in the fixture only if we write it.
        (self.pe / "out" / "g1.md").write_text("# G1\n\nDone.\n")

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        super().tearDown()

    def status(self, i):
        return graph.index(graph.load())[i]["status"]

    def test_done_needs_a_verifier_check_after_the_last_change(self):
        rc, out = run_graph("done", "G1", "built")
        self.assertEqual(rc, 1)
        self.assertIn("no independent verifier check", out)
        self.assertEqual(self.status("G1"), "running")
        # A check by the builder itself does not count.
        run_graph("log", "G1", "check", "all criteria PASS")
        self.assertEqual(run_graph("done", "G1", "built")[0], 1)
        # A verifier check that reports a gap does not count either.
        run_graph("log", "G1", "check", "--verifier", "Verifier: criterion 2 GAP")
        rc, out = run_graph("done", "G1", "built")
        self.assertEqual(rc, 1)
        self.assertIn("FAIL or GAP", out)
        # A passing verifier check, then done.
        run_graph("log", "G1", "check", "--verifier", "Verifier: every criterion PASS")
        rc, out = run_graph("done", "G1", "built")
        self.assertEqual(rc, 0, out)
        self.assertEqual(self.status("G1"), "done")

    def test_an_edit_after_the_check_needs_a_new_check(self):
        run_graph("log", "G1", "check", "--verifier", "Verifier: every criterion PASS")
        graph.activity_append("G1", "gamma", "edit", "changed the output after the check", t="2099-01-01T00:00:00Z")
        rc, out = run_graph("done", "G1", "built")
        self.assertEqual(rc, 1)
        self.assertIn("since the last change", out)

    def test_block_and_unblock_only_from_valid_states(self):
        for node in ("A1", "A2"):  # done and awaiting_human
            rc, out = run_graph("block", node, "why")
            self.assertEqual(rc, 1, node)
            self.assertIn("only pending or running", out)
        rc, out = run_graph("unblock", "A3", "why")  # pending, not blocked
        self.assertEqual(rc, 1)
        self.assertIn("not blocked", out)
        self.assertEqual(run_graph("block", "A3", "waiting on data")[0], 0)
        self.assertEqual(self.status("A3"), "blocked")
        self.assertEqual(run_graph("unblock", "A3", "data arrived")[0], 0)
        self.assertEqual(self.status("A3"), "pending")

    def test_long_log_text_is_kept_up_to_the_limit_and_warned_about(self):
        text = "x" * (graph.LOG_TEXT_MAX + 50)
        rc, out = run_graph("log", "A3", "note", text)
        self.assertEqual(rc, 0)
        self.assertIn("warning: activity text is", out)
        row = json.loads((self.pe / "graph" / "activity" / "A3.jsonl").read_text().splitlines()[-1])
        self.assertEqual(len(row["text"]), graph.LOG_TEXT_MAX)
        rc, out = run_graph("log", "A3", "note", "y" * 1200)
        self.assertNotIn("warning", out)


if __name__ == "__main__":
    unittest.main()
