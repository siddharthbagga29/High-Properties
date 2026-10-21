import json
import shutil
import unittest
import zipfile

from lql import ROOT
from lql.export import build
from tests.helpers import tmpdir


class ExportTests(unittest.TestCase):
    def test_bundle_excludes_secrets_env_db_and_private_memory(self):
        root = tmpdir() / "proj"
        (root / "docs").mkdir(parents=True)
        (root / "state").mkdir()
        (root / "agent_learning").mkdir()
        (root / "config").mkdir()
        shutil.copy(ROOT / "PROJECT_CONTEXT.md", root / "PROJECT_CONTEXT.md")
        (root / "docs" / "OK.md").write_text("# fine\napi_key=<your key here>\n")
        (root / "docs" / "LEAK.md").write_text("token: ghp_" + "a" * 36 + "\n")
        (root / "docs" / "AWS.md").write_text("AKIA" + "B" * 16)
        (root / ".env").write_text("BROKER_API_KEY=abc123abc123abc123\n")
        (root / ".env.example").write_text("BROKER_API_KEY=\n")
        (root / "state" / "current_state.json").write_text("{}")
        (root / "state" / "paper.db").write_text("x")
        (root / "agent_learning" / "MEMORY.md").write_text("PRIVATE-MEMORY-MARKER-7731")
        (root / "config" / "settings.json").write_text(json.dumps({"password": "hunter2hunter2hunter2"}))
        dest, man = build(root, tmpdir())
        names = set(zipfile.ZipFile(dest).namelist())
        self.assertIn("PROJECT_CONTEXT.md", names)
        self.assertIn("docs/OK.md", names)
        self.assertIn(".env.example", names)
        self.assertIn("MANIFEST.json", names)
        for bad in ("docs/LEAK.md", "docs/AWS.md", ".env", "state/paper.db", "agent_learning/MEMORY.md",
                    "config/settings.json"):
            self.assertNotIn(bad, names)
        blob = b"".join(zipfile.ZipFile(dest).read(n) for n in names)
        for s in (b"ghp_aaaa", b"AKIABBBB", b"abc123abc123", b"hunter2", b"PRIVATE-MEMORY-MARKER-7731"):
            self.assertNotIn(s, blob)

    def test_real_project_bundle_is_clean(self):
        dest, man = build(ROOT, tmpdir())
        self.assertTrue(any(f["path"] == "PROJECT_CONTEXT.md" for f in man["included"]))
        self.assertFalse([e for e in man["excluded"] if "secret" in e["reason"]], man["excluded"])
