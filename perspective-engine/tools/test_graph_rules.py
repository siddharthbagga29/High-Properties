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
        self.assertEqual((rc, "is FAIL" in out), (1, True))
        self.check("every criterion met. VERDICT: PASS")  # a PASS after a FAIL with no change in between is not enough
        self.assertEqual(self.done()[0], 1)
        self.out.write_text("# G1\n\nDone, gap fixed.\n")
        run_graph("log", "G1", "edit", "fixed criterion 2")
        self.check("every criterion met. VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)
        self.assertEqual(self.status("G1"), "done")

    def test_a_verifier_check_without_a_verdict_is_refused(self):
        bad = ("criterion 3 FAILED", "2 GAPs remain", "Fail - summary 170 words", "NOT MET - no source", "all good",
               "verdict: pass", "VERDICT: PASS. Correction: criterion 2 is not met",          # lowercase; not at the end
               "Builder said VERDICT: PASS; I disagree. VERDICT: FAIL",                       # two verdicts
               "VERDICT: PA\u017f\u017f", "\uff36\uff25\uff32\uff24\uff29\uff23\uff34: PASS",  # look-alike letters
               "ok VERDICT: FA\u200bIL VERDICT: PASS", "VERDICT: PASS\u200d")                  # zero-width characters
        for text in bad:
            rc, out = run_graph("log", "G1", "check", "--verifier", text)
            self.assertEqual(rc, 1, repr(text))
            self.assertIn("exactly one verdict", out)
        self.assertEqual(self.done()[0], 1)

    def test_a_non_check_verifier_row_does_not_clear_done(self):
        run_graph("log", "G1", "read", "--verifier", "Verifier: opened out/g1.md. VERDICT: PASS")
        self.assertEqual(self.done()[0], 1)

    def test_a_fail_followed_by_a_continuation_note_does_not_clear_done(self):
        self.check("criterion 1 PASS; criterion 2 missing source. VERDICT: FAIL")
        run_graph("log", "G1", "note", "--verifier", "Verifier (cont.): criterion 3 PASS")
        self.assertEqual(self.done()[0], 1)

    def test_a_fail_then_a_pass_with_no_change_does_not_clear_done(self):
        self.check("criterion 2 has no source for 40%. VERDICT: FAIL")
        self.check("criterion 3 (layout) checked separately. VERDICT: PASS")
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
        run_graph("log", "G1", "edit", "rewrote the summary")  # the change is logged: a new review span starts
        self.check("re-checked the new text. VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)

    def test_a_change_during_the_review_is_caught(self):
        run_graph("log", "G1", "read", "--verifier", "Verifier: reading out/g1.md")  # pins the outputs at review start
        self.out.write_text("# G1\n\nSwapped while the verifier was reading.\n")
        self.check("VERDICT: PASS")
        rc, out = self.done()
        self.assertEqual(rc, 1)
        self.assertIn("during or after", out)

    def test_directory_outputs_are_hashed_and_an_empty_one_is_refused(self):
        g = graph.load()
        graph.index(g)["G1"]["outputs"] = ["perspective-engine/out/site"]
        graph.save(g)
        site = self.pe / "out" / "site"
        site.mkdir()
        rc, out = self.done()
        self.assertEqual(rc, 1)
        self.assertIn("missing or empty", out)
        (site / "index.html").write_text("<p>v1</p>")
        self.check("VERDICT: PASS")
        (site / "evil.js").write_text("alert(1)")
        rc, out = self.done()
        self.assertEqual(rc, 1)
        self.assertIn("outputs changed", out)

    def test_the_done_event_records_the_output_hashes(self):
        self.check("VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)
        e = json.loads((self.pe / "graph" / "ledger.jsonl").read_text().splitlines()[-1])
        self.assertEqual(e["event"], "done")
        self.assertEqual(e["outputs"], graph.output_hashes(graph.index(graph.load())["G1"]))

    def test_reopen_rearms_the_gate_and_needs_a_new_check(self):
        self.check("VERDICT: PASS")
        self.assertEqual(self.done()[0], 0)
        self.assertEqual(run_graph("reopen", "G1", "")[0], 1)  # a reason is required
        self.assertEqual(run_graph("reopen", "G1", "audit finding AF-x")[0], 0)
        self.assertEqual(self.status("G1"), "running")
        self.assertEqual(self.done()[0], 1)  # the old PASS is before the reopen

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
