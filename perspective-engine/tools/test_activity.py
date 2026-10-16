"""Tests for transcript ingestion: a transcript that covered several tasks credits each task only with its own rows."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import activity  # noqa: E402

V05 = {"id": "V05", "outputs": ["perspective-engine/gtm/icp.md"]}
V07 = {"id": "V07", "outputs": ["perspective-engine/gtm/targets.csv"]}
V12 = {"id": "V12", "outputs": ["perspective-engine/legal/privacy.md"]}
M04 = {"id": "M04", "outputs": ["perspective-engine/legal/entity-checklist.md"]}
F01 = {"id": "F01", "outputs": ["perspective-engine/graph/graph.json", "perspective-engine/tools/graph.py"]}


def use(i, name, inp, t="2026-10-16T09:00:00.000Z"):
    return {"type": "assistant", "timestamp": t, "message": {"content": [{"type": "tool_use", "id": i, "name": name, "input": inp}]}}


class Related(unittest.TestCase):
    def test_names_the_task_id(self):
        self.assertTrue(activity.related(V05, "Ran python3 perspective-engine/tools/graph.py log V05 check --verifier"))

    def test_touches_an_output_path(self):
        self.assertTrue(activity.related(V05, "Read perspective-engine/gtm/icp.md"))
        self.assertTrue(activity.related(V05, "Ran grep -n helps gtm/icp.md"))

    def test_another_task_is_not_credited(self):
        self.assertFalse(activity.related(V05, "Ran python3 perspective-engine/tools/graph.py log V07 check --verifier"))
        self.assertFalse(activity.related(V05, "Read perspective-engine/gtm/targets.csv"))

    def test_id_must_be_a_whole_word(self):
        self.assertFalse(activity.related({"id": "V0", "outputs": []}, "graph.py brief V05"))
        self.assertFalse(activity.related(V05, "graph.py brief V050"))
        self.assertFalse(activity.related(V05, "AV05 was not it"))

    def test_a_path_must_be_a_whole_path(self):
        f02 = {"id": "F02", "outputs": ["perspective-engine/dashboard/index.html"]}
        self.assertFalse(activity.related(f02, "cat perspective-engine/data/roi-dashboard/index.html"))
        self.assertFalse(activity.related(V05, "diff gtm/icp.md.orig x"))
        self.assertTrue(activity.related(f02, "/home/user/High-Properties/perspective-engine/dashboard/index.html"))
        self.assertTrue(activity.related(V05, "grep -n x gtm/icp.md:12"))


class Extract(unittest.TestCase):
    def transcript(self, lines):
        import json, tempfile
        f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        f.write("\n".join(json.dumps(x) for x in lines))
        f.close()
        self.addCleanup(pathlib.Path(f.name).unlink)
        return f.name

    def test_a_short_description_is_matched_on_its_command_and_the_command_is_not_stored(self):
        use = lambda i, cmd, desc: {"type": "assistant", "timestamp": "2026-10-15T19:00:00.000Z",
                                    "message": {"content": [{"type": "tool_use", "id": i, "name": "Bash",
                                                             "input": {"command": cmd, "description": desc}}]}}
        fail = {"type": "user", "timestamp": "2026-10-15T19:00:01.000Z",
                "message": {"content": [{"type": "tool_result", "tool_use_id": "b", "is_error": True, "content": "Exit code 1"}]}}
        rows = activity.extract(self.transcript([
            use("a", "python3 tools/graph.py log V05 check --verifier 'x'", "Log the check row"),
            use("b", "cat -n perspective-engine/gtm/icp.md", "Read the ICP"),
            fail,
            use("c", "python3 tools/graph.py brief V07", "Print a brief"),
        ]))
        kept = [r["text"] for r in rows if activity.related(V05, r["match"])]
        self.assertEqual(kept, ["Log the check row", "Read the ICP", "Failed (Exit code 1): Read the ICP"])
        self.assertNotIn("graph.py", " ".join(r["text"] for r in rows))

    def test_ingest_keeps_only_related_rows_and_is_idempotent(self):
        import tempfile
        from unittest import mock
        use = lambda i, cmd: {"type": "assistant", "timestamp": f"2026-10-15T19:00:0{i}.000Z",
                              "message": {"content": [{"type": "tool_use", "id": str(i), "name": "Bash",
                                                       "input": {"command": cmd, "description": f"Step {i}"}}]}}
        tr = self.transcript([use(1, "graph.py brief V05"), use(2, "graph.py brief V07")])
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(activity.graph, "ACTIVITY", pathlib.Path(d)), \
                mock.patch.object(activity.graph, "load", lambda: {"nodes": [dict(V05, agent="gtm")]}):
            self.assertEqual(activity.ingest("V05", tr, actor="verifier", only_related=True), 1)
            self.assertEqual(activity.ingest("V05", tr, actor="verifier", only_related=True), 0)
            rows = activity.graph.jsonl(pathlib.Path(d) / "V05.jsonl")
            self.assertEqual([(r["text"], r["actor"], r["src"]) for r in rows], [("Step 1", "verifier", "transcript")])

    def related_texts(self, n, calls):
        return [r["text"] for r in activity.extract(self.transcript(calls)) if activity.related(n, r["match"])]

    def test_a_task_named_in_content_handoffs_or_scripts_is_not_credited(self):
        # A verifier run that checked only M04 and handed back "V12 NOT CHECKED" (review 5, ingest-replay #0): V12 gets
        # only the call that acted on its output, never the M04 verdict or the handoff that names it.
        calls = [
            use("a", "Read", {"file_path": "/home/user/High-Properties/perspective-engine/legal/entity-checklist.md"}),
            use("b", "Read", {"file_path": "/home/user/High-Properties/perspective-engine/legal/privacy.md"}),
            use("c", "Bash", {"command": "python3 perspective-engine/tools/graph.py log M04 check --verifier "
                                         "'consistent with legal/privacy.md ... VERDICT: PASS'", "description": "Log the M04 check row"}),
            use("d", "StructuredOutput", {"result": "M04 PASS. V12 NOT CHECKED: session limit reached before V12."}),
            use("e", "Write", {"file_path": "/tmp/scratch/add_rows.py", "content": "# rows for V12, see legal/privacy.md"}),
            use("f", "Edit", {"file_path": "perspective-engine/legal/entity-checklist.md", "old_string": "V12", "new_string": "legal/privacy.md"}),
            use("g", "Task", {"prompt": "Verify V12 against legal/privacy.md", "description": "Spawn the V12 check"}),
            use("h", "Bash", {"command": "python3 - <<'EOF'\nprint(open('perspective-engine/legal/privacy.md').read())  # V12\nEOF",
                              "description": "Count words"}),
            use("i", "Bash", {"command": "python3 -c \"print('V12', 'legal/privacy.md')\" && node -e 'V12'", "description": "Inline"}),
            use("j", "Bash", {"command": "cat -n \"$(cat <<'EOF'\nlegal/privacy.md\nEOF\n)\" ", "description": "Heredoc in a quote"}),
        ]
        self.assertEqual(self.related_texts(V12, calls), ["Read perspective-engine/legal/privacy.md"])
        self.assertEqual(self.related_texts(M04, calls),
                         ["Read perspective-engine/legal/entity-checklist.md", "Log the M04 check row",
                          "Edited perspective-engine/legal/entity-checklist.md"])

    def test_running_graph_py_is_not_work_on_its_file(self):
        calls = [
            use("a", "Bash", {"command": "python3 perspective-engine/tools/graph.py brief V07", "description": "Brief"}),
            use("b", "Bash", {"command": "cd perspective-engine && python3 -I tools/graph.py log V05 check 'x'", "description": "Log"}),
            use("c", "Bash", {"command": "sed -n 600,660p perspective-engine/tools/graph.py", "description": "Read export"}),
            use("d", "Edit", {"file_path": "/home/user/High-Properties/perspective-engine/tools/graph.py", "old_string": "a", "new_string": "b"}),
        ]
        self.assertEqual(self.related_texts(F01, calls), ["Read export", "Edited perspective-engine/tools/graph.py"])
        self.assertEqual(self.related_texts(V05, calls), ["Log"])

    def test_a_note_is_content_however_graph_py_was_reached(self):
        # Round-1 check of review 5, ingest-replay #0 and #1: run through $G, or with the note on a continuation line,
        # graph.py kept its note, so "V12 NOT CHECKED" credited V12 and a V07 note citing V05 credited V05.
        calls = [
            use("a", "Bash", {"command": "G=perspective-engine/tools/graph.py && python3 $G log M04 check --verifier "
                                         "'M04 consistent with the privacy note. V12 NOT CHECKED (session limit). VERDICT: PASS'",
                              "description": "Log the M04 check row"}),
            use("b", "Bash", {"command": "python3 perspective-engine/tools/graph.py log V07 edit \\\n  "
                                         "'Appended 12 segment-1 rows to targets.csv, counts as in V05 section 6'", "description": "Log the V07 edit"}),
            use("c", "Bash", {"command": 'P="python3 perspective-engine/tools/graph.py"\n$P log V07 note "rows follow V05 section 6"',
                              "description": "Note"}),
            use("d", "Bash", {"command": 'git commit -qm "graph: V05 done; V12 started"', "description": "Commit"}),
            use("e", "Bash", {"command": "grep -n 'V05' perspective-engine/graph/ledger.jsonl \"perspective-engine/legal/privacy.md\"",
                              "description": "Look up V05"}),
        ]
        self.assertEqual(self.related_texts(V12, calls), ["Look up V05"])  # it read V12's output, by path
        self.assertEqual(self.related_texts(V05, calls), ["Look up V05"])
        self.assertEqual(self.related_texts(M04, calls), ["Log the M04 check row"])
        self.assertEqual(self.related_texts(V07, calls), ["Log the V07 edit", "Note"])

    def test_graph_py_run_through_a_variable_is_not_work_on_its_file(self):
        calls = [
            use("a", "Bash", {"command": "T=perspective-engine/tools/graph.py && python3 $T done V05 \"50 accounts\"", "description": "Done"}),
            use("b", "Bash", {"command": "T=perspective-engine/tools/graph.py; for i in V05 V07; do python3 ${T} start $i; done",
                              "description": "Start"}),
            use("c", "Bash", {"command": "G=perspective-engine/tools/graph.py; sed -n 1,40p perspective-engine/tools/graph.py",
                              "description": "Read the header"}),
        ]
        self.assertEqual(self.related_texts(F01, calls), ["Read the header"])
        self.assertEqual(self.related_texts(V05, calls), ["Done", "Start"])

    def test_every_row_carries_its_call_id_outside_the_text(self):
        import json
        fail = {"type": "user", "timestamp": "2026-10-16T09:00:01.000Z",
                "message": {"content": [{"type": "tool_result", "tool_use_id": "toolu_b", "is_error": True, "content": "Exit code 1"}]}}
        tr = self.transcript([use("toolu_a", "Read", {"file_path": "perspective-engine/gtm/icp.md"}),
                              use("toolu_b", "Bash", {"command": "wc -w gtm/icp.md", "description": "Count"}), fail])
        stem = pathlib.Path(tr).stem
        rows = activity.extract(tr)
        self.assertEqual([r["call"] for r in rows], [f"{stem}:toolu_a", f"{stem}:toolu_b", f"{stem}:toolu_b"])
        self.assertNotIn("toolu", json.dumps([r["text"] for r in rows]))

    def test_ingest_stores_the_call_id(self):
        import tempfile
        from unittest import mock
        tr = self.transcript([use("toolu_a", "Bash", {"command": "graph.py brief V05", "description": "Step"})])
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(activity.graph, "ACTIVITY", pathlib.Path(d)), \
                mock.patch.object(activity.graph, "load", lambda: {"nodes": [dict(V05, agent="gtm")]}):
            activity.ingest("V05", tr)
            rows = activity.graph.jsonl(pathlib.Path(d) / "V05.jsonl")
            self.assertEqual([(r["text"], r["call"], "actor" in r) for r in rows], [("Step", f"{pathlib.Path(tr).stem}:toolu_a", False)])

    def test_a_related_row_records_whether_the_call_named_the_task_or_only_its_output(self):
        # A session on V07 read V05's output as V07's input (review 5, ingest-replay #1). V05 still gets the call, but
        # marked as credited only by path, so the city does not take it for work on V05.
        import tempfile
        from unittest import mock
        tr = self.transcript([
            use("a", "Bash", {"command": "python3 add_rows.py --segments-from perspective-engine/gtm/icp.md >> perspective-engine/gtm/targets.csv",
                              "description": "Append segment-1 rows to targets.csv"}),
            use("b", "Bash", {"command": "python3 perspective-engine/tools/graph.py log V05 edit 'recounted section 6'", "description": "Log the edit"}),
        ])
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(activity.graph, "ACTIVITY", pathlib.Path(d)), \
                mock.patch.object(activity.graph, "load", lambda: {"nodes": [dict(V05, agent="gtm"), dict(V07, agent="gtm")]}):
            activity.ingest("V05", tr, only_related=True)
            activity.ingest("V07", tr)
            v05, v07 = (activity.graph.jsonl(pathlib.Path(d) / f"{i}.jsonl") for i in ("V05", "V07"))
            self.assertEqual([(r["text"], r["related"]) for r in v05], [("Append segment-1 rows to targets.csv", "path"), ("Log the edit", "id")])
            self.assertEqual([r.get("related") for r in v07], [None, None])  # a whole transcript is the task's own


class CityExport(unittest.TestCase):
    """What graph.export hands the city from the activity log and the ledger."""

    # The record of model.test.ts 'a ledger cut to fit the document ...': the city replays a cut after the first five
    # events from the base checked here.
    NODES = [{"id": "A", "status": "pending"}, {"id": "B", "status": "awaiting_human", "gate": {"type": "founder", "reason": "r"}},
             {"id": "C", "status": "pending", "deps": ["A"]}, {"id": "D", "status": "done"}]
    LEDGER = [{"t": f"2026-10-01T00:{m:02d}:00Z", "event": e, "node": i, "note": ""} for m, (i, e) in enumerate([
        ("A", "start"), ("A", "done"), ("B", "start"), ("B", "done"), ("B", "clear-gate"), ("C", "start"), ("C", "block"),
        ("C", "unblock"), ("B", "reopen"), ("B", "done")], start=1)]

    def setUp(self):
        import json, tempfile
        from unittest import mock
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        root = pathlib.Path(td.name)
        pe = root / "perspective-engine"
        for d in ("graph/activity", "dashboard", "city/public"):
            (pe / d).mkdir(parents=True)
        nodes = [dict({"agent": "gtm", "title": n["id"], "deps": [], "outputs": [], "accept": [], "gate": None, "budget_k": 0}, **n) for n in self.NODES]
        (pe / "graph" / "graph.json").write_text(json.dumps({"project": "Fixture", "north_star": "test", "nodes": nodes,
                                                             "agents": {"gtm": {"name": "Ogilvy", "district": "G", "role": "g"}}}))
        # Fifty more events after the ten above, so a cut can keep part of the ledger.
        self.ledger = self.LEDGER + [{"t": f"2026-10-01T01:{m:02d}:00Z", "event": ("block", "unblock")[m % 2], "node": "C", "note": ""} for m in range(50)]
        (pe / "graph" / "ledger.jsonl").write_text("".join(json.dumps(e) + "\n" for e in self.ledger))
        (pe / "graph" / "activity" / "A.jsonl").write_text("".join(json.dumps(
            {"t": f"2026-10-01T00:01:{s:02d}Z", "node": "A", "agent": "gtm", "kind": "run", "text": f"step {s} " + "x" * 300, "src": "transcript"}) + "\n" for s in range(30)))
        g = activity.graph
        patcher = mock.patch.multiple(
            g, ROOT=root, PE=pe, GRAPH=pe / "graph" / "graph.json", LEDGER=pe / "graph" / "ledger.jsonl", ACTIVITY=pe / "graph" / "activity",
            STATE_JS=pe / "dashboard" / "state.js", CITY_JSON=pe / "city" / "public" / "state.json", REVENUE=pe / "graph" / "revenue.jsonl",
            AUDIT_JSON=pe / "graph" / "audit" / "scorecards.json", FOUNDER_AUTH=pe / "graph" / "founder-auth.jsonl")
        patcher.start()
        self.addCleanup(patcher.stop)

    def export(self, cap):
        """The city document graph.export writes under a size cap."""
        import json
        from unittest import mock
        with mock.patch.object(activity.graph, "MAX_STATE_BYTES", cap):
            activity.graph.export(activity.graph.load())
        return json.loads(activity.graph.CITY_JSON.read_text())

    def test_the_base_is_each_tasks_replayed_state_at_the_cut(self):
        base = activity.graph.ledger_base(self.NODES, self.LEDGER, 5)
        self.assertEqual(base, {"t": "2026-10-01T00:05:00Z", "events": 5, "status": {"A": "done", "B": "done", "C": "pending", "D": "done"}, "cleared": ["B"]})
        # The reopen re-armed B's gate, so its second done waits on the founder again.
        later = activity.graph.ledger_base(self.NODES, self.LEDGER, 10)
        self.assertEqual((later["status"], later["cleared"]), ({"A": "done", "B": "awaiting_human", "C": "pending", "D": "done"}, []))

    def test_the_ledger_is_kept_whole_while_dropping_the_rest_is_enough_and_then_cut_with_its_base(self):
        # Review 5, ingest-replay #2: the export cut the city's ledger to its last 40 events as soon as activity at 10
        # rows a task was not enough, and the city replayed the cut as the whole history.
        size = activity.graph.size
        full = self.export(10 ** 9)
        self.assertEqual((len(full["ledger"]), "ledgerBase" in full), (60, False))
        lean = size(dict(full, activity={}))
        city = self.export(lean)
        self.assertEqual((city["activity"], len(city["ledger"]), "ledgerBase" in city), ({}, 60, False))
        # Only when everything else is gone do the oldest events go, and the base holds every task's state at the cut.
        city = self.export(lean - 1_500)
        base, ordered = city["ledgerBase"], sorted(self.ledger, key=lambda e: e["t"])
        self.assertLessEqual(size(city), lean - 1_500)
        self.assertTrue(0 < base["events"] < 60)
        self.assertEqual(city["ledger"], ordered[base["events"]:])
        self.assertEqual(base, activity.graph.ledger_base(city["nodes"], ordered, base["events"]))

    def test_the_city_gets_the_call_id_and_how_a_row_was_related_but_no_hashes(self):
        r = {"t": "2026-10-16T09:00:00Z", "node": "V05", "agent": "gtm", "kind": "run", "text": "Print briefs", "src": "transcript",
             "call": "agent-a1:toolu_a", "related": "path", "outputs": {"perspective-engine/gtm/icp.md": "ab12"}}
        self.assertEqual(activity.graph.city_row(r), {k: v for k, v in r.items() if k != "outputs"})


if __name__ == "__main__":
    unittest.main()
