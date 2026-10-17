"""Auditor rules the third independent review found broken (tools/audit.py). Each test reproduces one confirmed finding
on the fixture of test_audit.py and fails on the auditor before its fix; the GateV4 tests replay the done gate of
commit be004ae.

Run: python3 -m unittest discover -s perspective-engine/tools -p 'test_*.py'
"""
import json
import shutil
import subprocess
import unittest

from test_audit import NOW, Tmp, act, build_fixture, graph_paths, jl, run_graph
import audit
import graph

SSH = shutil.which("ssh-keygen")
TODAY = "2026-10-16T05:"  # after GATE_V4_SINCE, before any clock this test runs on


def auto(pe):
    r = audit.compute(pe, NOW)
    return r, " | ".join(f["evidence"] for c in r["scorecards"] for f in c["findings"] if f["id"].startswith("AUTO-AUTH"))


def card(r, agent):
    c = next(c for c in r["scorecards"] if c["agent"] == agent)
    return c, {d["id"]: d for d in c["dimensions"]}


def facts(rows, events=(), status="done"):
    return audit.node_facts({"id": "X", "agent": "gamma", "status": status}, list(events), rows, NOW)


def verdict(t, text, outputs=None, kind="check", node="G1", **extra):
    r = dict(act(t, kind, text, actor="verifier", node=node), **extra)
    if outputs is not None:
        r["outputs"] = outputs
    return r


class GitRecord(Tmp):
    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)

    def append(self, rel, rows):
        with (self.pe / rel).open("a") as f:
            f.write(jl(rows))

    def commit(self):
        for args in (["init", "-q"], ["add", "-A"], ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "record"]):
            subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)


class Backdating(GitRecord):
    """Review 3, auditor #0: the self-declared date of a ledger or revenue line decided which rule covered it."""

    def test_a_backdated_done_is_replayed_by_its_place_in_the_ledger(self):
        with graph_paths(self.root):
            self.assertEqual(run_graph("start", "A3")[0], 0)  # stamped now, after GATE_V3_SINCE
        (self.pe / "out" / "a3.md").write_text("# A3\n\nUnverified draft.\n")
        self.append("graph/ledger.jsonl", [{"t": "2026-10-09T00:00:00Z", "event": "done", "node": "A3", "note": "",
                                            "outputs": {"perspective-engine/out/a3.md": None}}])
        _, texts = auto(self.pe)
        self.assertIn("A3: closed at 2026-10-09T00:00:00Z without a verifier PASS", texts)
        self.assertIn("(done A3 at 2026-10-09T00:00:00Z) is dated before the entry above it", texts)

    @unittest.skipUnless(SSH, "ssh-keygen not installed")
    def test_founder_actions_backdated_below_the_key_still_need_a_signature(self):
        (self.pe / "graph" / "revenue.jsonl").unlink()
        subprocess.run([SSH, "-q", "-t", "ed25519", "-N", "", "-C", "founder", "-f", str(self.root / "k")], check=True)
        with graph_paths(self.root):
            self.assertEqual(run_graph("founder-key", (self.root / "k.pub").read_text().strip())[0], 0)
        self.commit()
        self.append("graph/ledger.jsonl", [{"t": "2026-10-06T12:40:00Z", "event": "clear-gate", "node": "A2", "note": "ok"}])
        self.append("graph/revenue.jsonl", [{"t": "2026-10-06T12:40:00Z", "amountUsd": 50000, "payer": "Acme",
                                             "evidence": "INV-9", "recordedBy": "founder"}])
        _, texts = auto(self.pe)
        self.assertIn("ledger clear-gate A2 at 2026-10-06T12:40:00Z has no verified founder signature", texts)
        self.assertIn("revenue from Acme at 2026-10-06T12:40:00Z has no verified founder signature", texts)

    @unittest.skipUnless(SSH, "ssh-keygen not installed")
    def test_founder_actions_first_committed_together_with_the_key_need_a_signature(self):
        """Round-1 verification: a clear-gate slipped in above the key's line, or a revenue row dated before the key, added
        before a commit recorded the key, was exempt for good."""
        (self.pe / "graph" / "revenue.jsonl").write_text("")
        self.commit()
        subprocess.run([SSH, "-q", "-t", "ed25519", "-N", "", "-C", "founder", "-f", str(self.root / "k")], check=True)
        with graph_paths(self.root):
            self.assertEqual(run_graph("founder-key", (self.root / "k.pub").read_text().strip())[0], 0)
        ledger = self.pe / "graph" / "ledger.jsonl"
        lines = ledger.read_text().splitlines()
        slipped = {"t": "2026-10-08T12:00:00Z", "event": "clear-gate", "node": "A2", "note": "ok"}
        ledger.write_text("\n".join(lines[:-1] + [json.dumps(slipped), lines[-1]]) + "\n")
        self.append("graph/revenue.jsonl", [{"t": "2026-10-08T12:00:00Z", "amountUsd": 50000, "payer": "Acme",
                                             "evidence": "INV-9", "recordedBy": "founder"}])
        before = auto(self.pe)[1]  # no commit records the key yet
        self.commit()
        for texts in (before, auto(self.pe)[1]):
            self.assertIn("ledger clear-gate A2 at 2026-10-08T12:00:00Z has no verified founder signature", texts)
            self.assertIn("revenue from Acme at 2026-10-08T12:00:00Z has no verified founder signature", texts)


class FindingsFiles(GitRecord):
    """Review 3, auditor #1: a later findings file superseded an earlier one, and coverage came from any file."""

    def write(self, name, data):
        (self.pe / "graph" / "audit" / "findings" / name).write_text(json.dumps(data))

    def test_a_repeated_id_cannot_soften_or_move_a_finding(self):
        f2 = {"id": "F-2", "agent": "delta", "task": "D1", "severity": "critical", "kind": "process",
              "claim": "pilot fee sent to a buyer", "evidence": "outbox shows a sent email"}
        self.write("zz-delta.json", [dict(f2, status="accepted")])
        self.write("aa-move.json", [dict(f2, agent="gamma", status="accepted")])
        r = audit.compute(self.pe, NOW)
        delta, _ = card(r, "delta")
        self.assertEqual([(f["id"], f["status"]) for f in delta["findings"]], [("F-2", "open")])
        self.assertFalse(delta["meetsInstitutionalBar"])
        self.assertTrue(any("zz-delta.json[0] id F-2: repeats the id" in w for w in r["warnings"]))

    def test_the_basis_names_the_file_that_lifts_the_integrity_cap(self):
        self.write("zz-self.json", {"auditedAgents": ["gamma"], "findings": []})
        _, dims = card(audit.compute(self.pe, NOW), "gamma")
        self.assertIn("findings/zz-self.json", dims["integrity"]["basis"])

    def test_a_deleted_or_softened_finding_is_flagged_but_a_fix_is_not(self):
        self.commit()
        llm1 = self.pe / "graph" / "audit" / "findings" / "llm-1.json"
        data = json.loads(llm1.read_text())
        data["findings"] = [dict(f, status="fixed", evidence=f["evidence"] + " || re-check: out/a1.md now cites the CRM export")
                            if f["id"] == "F-1" else f for f in data["findings"]]
        llm1.write_text(json.dumps(data))
        self.assertEqual(auto(self.pe)[1], "")  # a re-check fixed it and recorded what it found: the record's normal course
        data["findings"] = [dict(f, severity="minor") if f["id"] == "F-2" else f for f in data["findings"] if f["id"] != "F-4"]
        llm1.write_text(json.dumps(data))
        _, texts = auto(self.pe)
        self.assertIn("finding F-4 (minor, in findings/llm-1.json at", texts)
        self.assertIn("finding F-2 was critical in findings/llm-1.json at", texts)

    def test_a_status_lowered_or_a_finding_moved_in_place_with_the_same_evidence_is_flagged(self):
        """Round-1 verification: editing the original file in place (F-2 open to accepted, F-1 to another agent) raised
        nothing, and a finding whose evidence was emptied is skipped as if deleted."""
        self.commit()
        llm1 = self.pe / "graph" / "audit" / "findings" / "llm-1.json"
        data = json.loads(llm1.read_text())
        # new punctuation is not new evidence
        edit = {"F-2": {"status": "accepted", "evidence": "outbox shows a sent email."}, "F-1": {"agent": "gamma"}, "F-4": {"evidence": " "}}
        data["findings"] = [dict(f, **edit.get(f["id"], {})) for f in data["findings"]]
        llm1.write_text(json.dumps(data))
        _, texts = auto(self.pe)
        self.assertIn("finding F-2 was open in findings/llm-1.json at", texts)
        self.assertIn("is accepted now with the same evidence", texts)
        self.assertIn("finding F-1 named agent Ann, task A1, kind unsupported_claim in findings/llm-1.json at", texts)
        self.assertIn("names agent gamma, task A1, kind unsupported_claim now with the same evidence", texts)
        self.assertIn("finding F-4 (minor, in findings/llm-1.json at", texts)


class ActivityLogs(GitRecord):
    """Review 3, auditor #2: activity logs could be rewritten or future-dated with no flag."""

    def test_a_committed_row_rewritten_away_is_flagged(self):
        self.commit()
        a2 = self.pe / "graph" / "activity" / "A2.jsonl"
        a2.write_text("".join(l + "\n" for l in a2.read_text().splitlines() if "Verifier FAIL" not in l))
        self.assertIn("graph/activity/A2.jsonl was rewritten, not appended to (at the working copy)", auto(self.pe)[1])

    def test_rows_from_the_future_count_for_nothing_and_backdated_rows_are_flagged(self):
        self.append("graph/activity/G1.jsonl", [act("2099-01-01T00:00:00Z", "write", "Wrote out/g1.md", src="transcript", node="G1")])
        self.append("graph/activity/A1.jsonl", [act("2026-10-06T10:01:00Z", "note", "logged late", node="A1")])
        r, texts = auto(self.pe)
        self.assertEqual(card(r, "gamma")[1]["reliability"]["score"], 80.0)  # G1 is still stalled
        self.assertIn("graph/activity/G1.jsonl: 1 rows dated after the audit ran", texts)
        self.assertIn("graph/activity/A1.jsonl: a row graph.py logged (note at 2026-10-06T10:01:00Z) is dated before", texts)


class VerificationCredit(Tmp):
    """Review 3, auditor #3: a transcript Read, dated by its own file, earned full on-time and separation credit."""

    def test_a_transcript_read_is_not_a_check_and_dates_nothing(self):
        pe = build_fixture(self.root)
        with (pe / "graph" / "activity" / "B1.jsonl").open("a") as f:
            f.write(jl([act("2026-10-06T13:15:00Z", "read", "Read perspective-engine/out/b1.md", src="transcript",
                            actor="verifier", node="B1")]))
        _, dims = card(audit.compute(pe, NOW), "beta")
        self.assertEqual(dims["process"]["score"], 25.0)
        self.assertIn("closed with no verification record", dims["process"]["basis"])


class RevisionBoundaries(unittest.TestCase):
    """Review 3, auditor #4 and ingest-replay #1 and #4: what counts as a revision between verifier reviews."""

    H1, H2 = {"o.md": "1" * 64}, {"o.md": "2" * 64}

    def test_outputs_that_differ_between_two_fails_are_two_rounds(self):
        rows = [act("2026-10-12T10:00:00Z", "write", "Wrote o.md", node="G1"),
                verdict("2026-10-12T10:10:00Z", "gap 1. VERDICT: FAIL", self.H1),
                verdict("2026-10-12T10:20:00Z", "gap 2. VERDICT: FAIL", self.H2),  # the builder edited without logging
                act("2026-10-12T10:30:00Z", "edit", "Edited o.md", node="G1"),
                verdict("2026-10-12T10:40:00Z", "all met. VERDICT: PASS", self.H1)]
        self.assertEqual(facts(rows)["rework"], 2)
        same = [dict(r, outputs=self.H1) if "outputs" in r else r for r in rows]
        self.assertEqual(facts(same)["rework"], 1)

    def test_a_fail_on_outputs_that_then_changed_is_no_longer_open(self):
        rows = [verdict("2026-10-12T10:10:00Z", "gap. VERDICT: FAIL", self.H1),
                verdict("2026-10-12T10:20:00Z", "all met. VERDICT: PASS", self.H2)]
        self.assertEqual(facts(rows)["open_fail"], 0)

    def test_another_tasks_transcript_call_is_not_a_revision(self):
        rows = [verdict("2026-10-12T10:10:00Z", "gap. VERDICT: FAIL", self.H1),
                act("2026-10-12T10:20:00Z", "run", "Append rows to targets.csv", src="transcript", node="G1")]
        self.assertEqual(facts(rows)["open_fail"], 1)

    def test_a_builder_row_worded_like_the_verifier_is_the_builders_after_the_actor_flag(self):
        fixed = act("2026-10-12T10:20:00Z", "edit", "Verifier GAP fixed: section 6 recounted", node="G1")
        self.assertFalse(audit.is_verifier(fixed))
        self.assertEqual(facts([verdict("2026-10-12T10:10:00Z", "gap. VERDICT: FAIL", self.H1), fixed])["open_fail"], 0)
        self.assertTrue(audit.is_verifier(act("2026-10-06T10:00:00Z", "check", "Verifier: PASS", node="G1")))  # legacy


class Ownership(Tmp):
    """Review 3, auditor #5: editing a task's agent in graph.json, or removing the task, moved its failures."""

    def test_a_task_is_scored_against_the_agent_graph_py_recorded(self):
        pe = build_fixture(self.root)
        g = json.loads((pe / "graph" / "graph.json").read_text())
        before = card(audit.compute(pe, NOW), "alpha")[1]["effective_challenge"]["score"]
        for edit in ("reassign", "remove"):
            nodes = [dict(n, agent="beta") if n["id"] == "A2" else n for n in g["nodes"]] if edit == "reassign" \
                else [n for n in g["nodes"] if n["id"] != "A2"]
            (pe / "graph" / "graph.json").write_text(json.dumps(dict(g, nodes=nodes)))
            r, texts = auto(pe)
            self.assertEqual(card(r, "alpha")[1]["effective_challenge"]["score"], before, edit)
            self.assertIn("A2: graph.json names beta" if edit == "reassign" else "A2: the ledger or an activity log records", texts)


class HiddenLabels(Tmp):
    """Review 3, auditor #6: labels no reader sees traced a claim."""

    def test_hidden_elements_and_empty_links_are_not_labels(self):
        cases = {
            "hidden.html": "<p>We have 40 customers.<span hidden>[S]</span></p>",
            "none.html": "<p>We have 40 customers.<span style=\"display: none\">source</span></p>",
            "aria.html": "<p>We have 40 customers.<span aria-hidden=\"true\">[S]</span></p>",
            "empty.md": "We have 40 customers. [](https://example.org)\n",
            "refdef.md": "We have 40 customers.\n\n[S]: https://example.org\n",
            "span.md": "We have 40 customers. <span hidden>[S]</span>\n",
        }
        for name, text in cases.items():
            p = self.root / name
            p.write_text(text)
            self.assertEqual(audit.evidence_for_file(p)[1], 0, name)
        (self.root / "seen.md").write_text("We have 40 customers [S].\n")
        self.assertEqual(audit.evidence_for_file(self.root / "seen.md")[1], 1)

    def test_labels_hidden_by_nesting_markup_styles_or_blank_link_text_are_not_labels(self):
        """Round-1 verification: each of these still traced the claim with no label a reader sees."""
        cases = {
            "nested.html": "<p>We have 40 customers.<span hidden><span></span>[S]</span></p>",
            "nested.md": "We have 40 customers. <div hidden><div></div>[S]</div>\n",
            "unclosed.md": "We have 40 customers. <span hidden>[S]\n",
            "anchor.md": 'We have 40 customers. <a href="https://example.org"></a>\n',
            "title.md": 'We have 40 customers. <span title="[S]"></span>\n',
            "zero-width.md": "We have 40 customers. [\u200b](https://example.org)\n",
            "nbsp.md": "We have 40 customers. [&nbsp;](https://example.org)\n",
            "font-size.html": '<p>We have 40 customers.<span style="font-size:0">[S]</span></p>',
            "opacity.html": "<p>We have 40 customers.<span style='opacity: 0.0'>[S]</span></p>",
            "transparent.html": '<p>We have 40 customers.<span style="color:transparent !important">[S]</span></p>',
            "quoted.html": '<p>We have 40 customers.<a title=">" href="https://example.org"></a></p>',
            "code-inside.md": "We have 40 customers. <span hidden>`x` [S]</span>\n",
        }
        for name, text in cases.items():
            p = self.root / name
            p.write_text(text)
            self.assertEqual(audit.evidence_for_file(p)[:2], (1, 0), name)

    def test_what_a_reader_sees_still_counts(self):
        cases = {
            "link.md": "We have 40 customers ([CRM export](https://example.org)).\n",
            "autolink.md": "We have 40 customers <https://example.org>.\n",
            "title.html": '<p>We have 40 customers.<span title="a hidden gem">[S]</span></p>',
            "after-block.md": "<p hidden>draft\n\nWe have 40 customers [S].\n",
            "code.md": "```html\n<div hidden>\n```\n\nWe have 40 customers [S].\n",
            "inline-code.md": "We have 40 customers `<span hidden>` [S].\n",
        }
        for name, text in cases.items():
            p = self.root / name
            p.write_text(text)
            self.assertEqual(audit.evidence_for_file(p)[:2], (1, 1), name)


class KeywordRules(Tmp):
    """Review 3, auditor #7, #8 and #9: wording that the keyword rules misread."""

    def delta(self, rows=(), blocks=()):
        """Delta's dimensions on a fresh fixture, audited (no integrity cap), with rows and ledger events added to D1."""
        self.runs = getattr(self, "runs", 0) + 1
        pe = build_fixture(self.root / f"run{self.runs}")
        (pe / "graph" / "audit" / "findings" / "llm-1.json").write_text(json.dumps({"auditedAgents": ["delta"], "findings": []}))
        with (pe / "graph" / "activity" / "D1.jsonl").open("a") as f:
            f.write(jl(rows))
        with (pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(jl({"t": t, "event": ev, "node": "D1", "note": note} for t, ev, note in blocks))
        return {k: d["score"] for k, d in card(audit.compute(pe, NOW), "delta")[1].items()}

    def test_corrections_follow_the_convention_not_the_word_correct(self):
        self.assertEqual(self.delta([act("2026-10-07T10:00:00Z", "note", "Orchestrator: correct as written; all 3 figures trace", node="D1")])["integrity"], 100.0)
        self.assertEqual(self.delta([act("2026-10-07T10:00:00Z", "edit", "Mayor - corrected the false 25% uptake claim", node="D1")])["integrity"], 80.0)

    def test_negated_wording_names_nothing(self):
        d = self.delta([verdict("2026-10-12T10:00:00Z", "Verifier: no minor or non-blocking issues remain. VERDICT: PASS", node="D1")])
        self.assertEqual(d["effective_challenge"], 100.0)
        d = self.delta([verdict("2026-10-12T10:00:00Z", "Verifier: criterion 2 missing; no false or invented figures found. VERDICT: FAIL", node="D1")])
        self.assertEqual(d["integrity"], 100.0)

    def test_a_nil_answer_or_a_negation_further_back_names_nothing(self):
        """Round-1 verification: honest wording that names nothing wrong still scored as a defect."""
        for text in ("minor issues: none.", "non-blocking notes: none.", "none of the notes is minor or non-blocking."):
            d = self.delta([verdict("2026-10-12T10:00:00Z", f"Verifier: all criteria met; {text} VERDICT: PASS", node="D1")])
            self.assertEqual(d["effective_challenge"], 100.0, text)
        for text in ("fabrication check: none found.", "none of the 12 figures is false or invented.",
                     "false or invented figures: none."):
            d = self.delta([verdict("2026-10-12T10:00:00Z", f"Verifier: criterion 2 missing; {text} VERDICT: FAIL", node="D1")])
            self.assertEqual(d["integrity"], 100.0, text)
        for text in ("Orchestrator: correction not needed; all 3 figures trace", "Mayor: corrections none required after re-check",
                     "Orchestrator: correction unnecessary, figures trace"):
            self.assertEqual(self.delta([act("2026-10-07T10:00:00Z", "note", text, node="D1")])["integrity"], 100.0, text)

    def test_a_negation_in_another_clause_cancels_nothing(self):
        d = self.delta([verdict("2026-10-12T10:00:00Z", "Verifier: the 25% figure is false: none of the cited surveys report "
                                                        "it. VERDICT: FAIL", node="D1")])
        self.assertEqual(d["integrity"], 95.0)
        # The real V07 review: "(LBNL not checked). Non-blocking notes: ..." leaves a note open.
        d = self.delta([verdict("2026-10-12T10:00:00Z", "Verifier: criteria met (LBNL not checked). Non-blocking notes: "
                                                        "DXC:7 cites a page my search did not surface. VERDICT: PASS", node="D1")])
        self.assertEqual(d["effective_challenge"], 97.0)

    def test_a_fabrication_named_in_a_note_counts_once_for_its_fail_verdict(self):
        d = self.delta([verdict("2026-10-12T10:00:00Z", "Verifier GAP: the 25% uptake figure is fabricated", kind="note", node="D1"),
                        verdict("2026-10-12T10:00:30Z", "Verifier GAP: and the survey does not report it", kind="note", node="D1"),
                        verdict("2026-10-12T10:01:00Z", "criteria 1-3 checked, see the notes above. VERDICT: FAIL", node="D1")])
        self.assertEqual(d["integrity"], 95.0)

    def test_a_failed_round_stays_a_quality_block_whatever_else_the_note_says(self):
        note = "Verification round 2 failed: fee arithmetic wrong"
        for extra in ("", "; builder stalled", "; founder paused review"):
            self.assertEqual(audit.block_class(note + extra), "verification", extra)
        self.assertEqual(audit.block_class("Build interrupted by the usage limit; rebuild queued after the current "
                                           "verification wave"), "interruption")
        self.assertEqual(audit.block_class("push failed at 10:00"), "interruption")
        d = self.delta(blocks=[("2026-10-08T11:30:00Z", "block", note + "; builder stalled"),
                               ("2026-10-08T11:35:00Z", "unblock", "go")])
        self.assertEqual((d["first_pass_yield"], d["reliability"]), (0.0, 92.0))

    def test_a_verifier_gap_or_a_defect_stays_a_quality_block_whatever_else_the_note_says(self):
        """Round-1 verification: a GAP or a defect worded without "round N" or "failed" became an interruption or a
        founder stop once the note also said "stalled" or "founder paused"."""
        for note, kind in (("Verifier GAP: fee arithmetic wrong", "verification"), ("Rework needed: fee arithmetic wrong", "other")):
            for extra in ("", "; builder stalled", "; founder paused review"):
                self.assertEqual(audit.block_class(note + extra), kind, note + extra)
        d = self.delta(blocks=[("2026-10-08T11:30:00Z", "block", "Rework needed: fee arithmetic wrong; builder stalled"),
                               ("2026-10-08T11:35:00Z", "unblock", "go")])
        self.assertEqual((d["first_pass_yield"], d["reliability"]), (0.0, 92.0))


class MeasuredFindings(Tmp):
    """Review 3, auditor #10: a finding about another agent's late-checked closure was excused as already measured."""

    def test_a_missing_check_finding_against_another_agent_is_deducted(self):
        pe = build_fixture(self.root)
        (pe / "graph" / "revenue.jsonl").unlink()
        with (pe / "graph" / "activity" / "B1.jsonl").open("a") as f:
            f.write(jl([act("2026-10-08T10:00:00Z", "check", "Verifier: retro-check PASS", actor="verifier", node="B1")]))
        mayor = lambda: card(audit.compute(pe, NOW), "orchestrator")[1]["process"]["score"]
        before = mayor()
        (pe / "graph" / "audit" / "findings" / "m.json").write_text(json.dumps([{
            "id": "M-1", "agent": "orchestrator", "task": "B1", "severity": "major", "kind": "process", "status": "open",
            "claim": "Mayor ran done on B1 with no verifier record before closing",
            "evidence": "B1 has no verifier check entry before its done event"}]))
        self.assertEqual(mayor(), before - 6)


class RubricText(unittest.TestCase):
    """Review 3, auditor #11: the published rubric contradicted the code on accepted findings and --verifier credit."""

    def test_the_rubric_states_the_weights_the_code_uses(self):
        text = (audit.PE_DEFAULT / "docs" / "JARVIS_AUDIT_RUBRIC.md").read_text()
        self.assertEqual(audit.STATUS_FACTOR["accepted"], 0.0)
        self.assertFalse("counts half" in text)
        self.assertIn("10 of the 25", text)
        self.assertIn("85: verified on time, separation only declared with the flag", text)


class GateV4(Tmp):
    """The done gate of commit be004ae, replayed for closures after GATE_V4_SINCE; earlier closures keep the V3 rule."""

    def setUp(self):
        super().setUp()
        self.pe = build_fixture(self.root)
        out = self.pe / "out" / "a3.md"
        out.write_text("# A3\n\nVerified.\n")
        self.h = {"perspective-engine/out/a3.md": audit.path_hash(out)}

    def close(self, day, middle):
        """A3 started, reviewed and closed on day (a hand-written record graph.py would have refused)."""
        rows = [act(day + "10:00Z", "plan", "start: ", src="ledger", node="A3")]
        rows += [dict(r, node="A3", agent="alpha", t=day + r["t"]) for r in middle]
        rows += [act(day + "50:00Z", "handoff", "done: ", src="ledger", node="A3")]
        (self.pe / "graph" / "activity" / "A3.jsonl").write_text(jl(rows))
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(jl([{"t": day + "10:00Z", "event": "start", "node": "A3", "note": ""},
                        {"t": day + "50:00Z", "event": "done", "node": "A3", "note": "", "outputs": self.h}]))
        g = json.loads((self.pe / "graph" / "graph.json").read_text())
        g["nodes"] = [dict(n, status="done") if n["id"] == "A3" else n for n in g["nodes"]]
        (self.pe / "graph" / "graph.json").write_text(json.dumps(g))
        return auto(self.pe)[1]

    def failed(self, t="20:00Z", **extra):
        return dict(verdict(t, "gap. VERDICT: FAIL", self.h), **extra)

    def passed(self):
        return verdict("40:00Z", "all met. VERDICT: PASS", self.h)

    def test_a_fail_on_the_same_bytes_stands_until_they_change(self):
        middle = [self.failed(), act("30:00Z", "edit", "Edited a3.md (no change)", node="A3"), self.passed()]
        self.assertIn("A3: closed at 2026-10-16T05:50:00Z without a verifier PASS that graph.py's done gate accepts "
                      "(the verifier FAILed these exact outputs", self.close(TODAY, middle))

    def test_a_closure_before_gate_v4_keeps_the_v3_rule(self):
        middle = [self.failed(), act("30:00Z", "edit", "Edited a3.md (no change)", node="A3"), self.passed()]
        self.assertNotIn("A3: closed", self.close("2026-10-12T05:", middle))

    def test_a_verifier_row_is_not_a_change(self):
        middle = [self.failed(t="20:00Z"), verdict("30:00Z", "Ran the tests", self.h, kind="run"), self.passed()]
        self.assertIn("(a verifier verdict since the last change is FAIL)", self.close(TODAY, middle))

    def test_an_invalid_check_meant_as_a_fail_counts_as_one(self):
        middle = [act("15:00Z", "edit", "Edited a3.md", node="A3"),
                  self.failed(t="20:00Z", text="gap… verdict: fail", invalid=True), self.passed()]
        self.assertIn("(a verifier verdict since the last change is FAIL)", self.close(TODAY, middle))

    def test_a_valid_review_passes(self):
        middle = [act("15:00Z", "edit", "Edited a3.md", node="A3"), self.passed()]
        self.assertNotIn("A3: closed", self.close(TODAY, middle))

    def test_live_state_outputs_are_never_compared_by_their_bytes(self):
        g = json.loads((self.pe / "graph" / "graph.json").read_text())
        g["nodes"] = [dict(n, outputs=n["outputs"] + ["perspective-engine/graph/graph.json"]) if n["id"] == "A3" else n
                      for n in g["nodes"]]
        (self.pe / "graph" / "graph.json").write_text(json.dumps(g))
        self.h["perspective-engine/graph/graph.json"] = audit.LIVE_STATE
        texts = self.close(TODAY, [act("15:00Z", "edit", "Edited a3.md", node="A3"), self.passed()])
        self.assertNotIn("A3: outputs changed after the task was closed", texts)

    def test_only_the_record_s_own_files_are_live_state(self):
        # graph.py's output_hashes pins only graph, ledger, activity and revenue as live state; a done line that pins an
        # ordinary output as live state would keep it from ever counting as changed.
        self.h["perspective-engine/out/a3.md"] = audit.LIVE_STATE
        texts = self.close(TODAY, [act("15:00Z", "edit", "Edited a3.md", node="A3"), self.passed()])
        self.assertIn("A3: outputs changed after the task was closed", texts)

    def test_path_hash_is_graph_pys(self):
        d = self.root / "site"
        (d / "a").mkdir(parents=True)
        (d / "a-b").mkdir()
        (d / "a" / "x").write_text("1")
        (d / "a-b" / "x").write_text("2")
        (d / "link.js").symlink_to("a/x")
        self.assertEqual(audit.path_hash(d), graph.path_hash(d))

    def test_a_clear_gate_above_the_done_it_covers_is_flagged(self):
        with (self.pe / "graph" / "ledger.jsonl").open("a") as f:
            f.write(jl([{"t": "2026-10-09T10:00:00Z", "event": "reopen", "node": "A2", "note": "rework"},
                        {"t": "2026-10-09T10:05:00Z", "event": "clear-gate", "node": "A2", "note": "approved early"}]))
        self.assertIn("A2: the founder gate was cleared at 2026-10-09T10:05:00Z before the task was done", auto(self.pe)[1])


if __name__ == "__main__":
    unittest.main()
