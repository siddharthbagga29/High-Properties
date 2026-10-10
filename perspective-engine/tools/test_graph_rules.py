"""Rules tools/graph.py enforces on state changes. done needs an independent verifier verdict after the last change,
with the outputs unchanged since that check; block and unblock only from sensible states; long activity text is never
cut silently, and a verifier check is never cut at all. Several cases are bypasses an independent reviewer demonstrated.

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
        self.out = self.pe / "out" / "g1.md"
        self.out.write_text("# G1\n\nDone.\n")  # G1 is running in the fixture

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        super().tearDown()

    def status(self, i):
        return graph.index(graph.load())[i]["status"]

    def check(self, text):
        rc, out = run_graph("log", "G1", "check", "--verifier", text)
        self.assertEqual(rc, 0, out)

    def done(self):
        return run_graph("done", "G1", "built")

    def test_done_needs_an_explicit_pass_verdict_from_the_verifier(self):
        rc, out = self.done()
        self.assertEqual(rc, 1)
        self.assertIn("no verifier verdict", out)
        run_graph("log", "G1", "check", "all criteria PASS. VERDICT: PASS")  # the builder's own check does not count
        self.assertEqual(self.done()[0], 1)
        self.check("criterion 2 has a gap. VERDICT: FAIL")
        rc, out = self.done()
        self.assertEqual((rc, "not PASS" in out), (1, True))
        self.check("every criterion met. VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)
        self.assertEqual(self.status("G1"), "done")

    def test_a_verifier_check_without_a_verdict_is_refused(self):
        for text in ("criterion 3 FAILED", "2 GAPs remain", "Fail - summary 170 words", "NOT MET - no source", "all good"):
            rc, out = run_graph("log", "G1", "check", "--verifier", text)
            self.assertEqual(rc, 1, text)
            self.assertIn("explicit verdict", out)
        self.assertEqual(self.done()[0], 1)

    def test_a_non_check_verifier_row_does_not_clear_done(self):
        run_graph("log", "G1", "read", "--verifier", "Verifier: opened out/g1.md. VERDICT: PASS")
        self.assertEqual(self.done()[0], 1)

    def test_a_fail_followed_by_a_continuation_note_does_not_clear_done(self):
        self.check("criterion 1 PASS; criterion 2 missing source. VERDICT: FAIL")
        run_graph("log", "G1", "note", "--verifier", "Verifier (cont.): criterion 3 PASS")
        self.assertEqual(self.done()[0], 1)

    def test_a_verdict_naming_both_pass_and_fail_does_not_clear_done(self):
        self.check("VERDICT: PASS for 1-3, VERDICT: FAIL for 4")
        self.assertEqual(self.done()[0], 1)

    def test_a_long_verifier_check_is_refused_not_cut(self):
        rc, out = run_graph("log", "G1", "check", "--verifier", "x" * graph.LOG_TEXT_MAX + " VERDICT: FAIL")
        self.assertEqual(rc, 1)
        self.assertIn("must fit", out)
        self.assertEqual(self.done()[0], 1)

    def test_outputs_changed_after_the_check_need_a_new_check(self):
        self.check("VERDICT: PASS")
        self.out.write_text("# G1\n\nChanged without any log row.\n")
        rc, out = self.done()
        self.assertEqual(rc, 1)
        self.assertIn("outputs changed", out)
        self.check("re-checked the new text. VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)

    def test_a_logged_change_in_the_same_second_after_the_check_needs_a_new_check(self):
        self.check("VERDICT: PASS")
        t = json.loads((self.pe / "graph" / "activity" / "G1.jsonl").read_text().splitlines()[-1])["t"]
        graph.activity_append("G1", "gamma", "run", "sed -i ... out/g1.md", t=t)  # same timestamp, later in the file
        self.assertEqual(self.done()[0], 1)

    def test_block_unblock_and_start_need_a_new_check(self):
        self.check("VERDICT: PASS")
        run_graph("block", "G1", "pause")
        run_graph("unblock", "G1", "resume")
        self.assertEqual(run_graph("start", "G1")[0], 0)
        self.assertEqual(self.done()[0], 1)

    def test_block_and_unblock_only_from_valid_states(self):
        for node in ("A1", "A2"):  # done and awaiting_human
            rc, out = run_graph("block", node, "why")
            self.assertEqual(rc, 1, node)
            self.assertIn("only pending or running", out)
        rc, out = run_graph("unblock", "A3", "why")  # pending, not blocked
        self.assertEqual(rc, 1)
        self.assertIn("not blocked", out)
        self.assertEqual(run_graph("block", "G1", "two failed rounds")[0], 0)  # running -> blocked
        self.assertEqual(run_graph("block", "A3", "waiting on data")[0], 0)
        self.assertEqual(self.status("A3"), "blocked")
        self.assertEqual(run_graph("unblock", "A3", "data arrived")[0], 0)
        self.assertEqual(self.status("A3"), "pending")

    def test_long_builder_text_is_kept_up_to_the_limit_marked_and_warned_about(self):
        rc, out = run_graph("log", "A3", "note", "x" * (graph.LOG_TEXT_MAX + 50))
        self.assertEqual(rc, 0)
        self.assertIn("warning: activity text is", out)
        row = json.loads((self.pe / "graph" / "activity" / "A3.jsonl").read_text().splitlines()[-1])
        self.assertEqual((len(row["text"]), row["truncated"]), (graph.LOG_TEXT_MAX, True))
        rc, out = run_graph("log", "A3", "note", "y" * 1200)
        self.assertNotIn("warning", out)


if __name__ == "__main__":
    unittest.main()
