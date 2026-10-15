"""Tests for transcript ingestion: a transcript that covered several tasks credits each task only with its own rows."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import activity  # noqa: E402

V05 = {"id": "V05", "outputs": ["perspective-engine/gtm/icp.md"]}


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


if __name__ == "__main__":
    unittest.main()
