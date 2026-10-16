"""Tests for transcript ingestion: a transcript that covered several tasks credits each task only with its own rows."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import activity  # noqa: E402

V05 = {"id": "V05", "outputs": ["perspective-engine/gtm/icp.md"]}
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


if __name__ == "__main__":
    unittest.main()
