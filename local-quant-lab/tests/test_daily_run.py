"""scripts/daily_run.py: one scheduled pass, on a throwaway state directory and synthetic data only."""
import fcntl
import importlib.util
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from lql import ROOT

spec = importlib.util.spec_from_file_location("daily_run", ROOT / "scripts" / "daily_run.py")
daily_run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily_run)

NOW = datetime(2026, 10, 23, 22, 30, tzinfo=timezone.utc)
KEY = "massiveKEY-never-printed-123"


class DailyRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="lql-daily-"))
        cls.state, cls.snaps = cls.tmp / "state", cls.tmp / "snapshots"
        cls.snaps.mkdir()
        cls.args = ["--state-dir", str(cls.state), "--snapshot-dir", str(cls.snaps)]
        cls.rc = daily_run.main(cls.args, env={}, now=NOW)
        cls.report = json.loads((cls.state / "reports" / "daily" / "latest.json").read_text())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def steps(self, report=None):
        return {s["step"]: s for s in (report or self.report)["steps"]}

    def test_a_synthetic_pass_runs_research_jobs_and_writes_a_report(self):
        self.assertEqual(self.rc, 0)
        self.assertEqual((self.report["status"], self.report["execution_mode"], self.report["live_trading"]),
                         ("ok", "SIMULATED", "absent"))
        self.assertEqual(self.report["jobs_via"], "this process")          # --state-dir never talks to a server
        r = self.steps()["research"]
        self.assertEqual(r["status"], "ran")
        self.assertIn("synthetic demo", r["detail"])
        self.assertEqual(len(r["results"]), 4)                              # 2 demo instruments x 2 strategies
        for row in r["results"]:
            self.assertEqual((row["status"], row["data_state"]), ("succeeded", "SYNTHETIC"))
            self.assertNotEqual(row["verdict"], "CANDIDATE")                 # synthetic data is never evidence
            self.assertEqual(row["montecarlo"]["status"], "succeeded")
        self.assertEqual(len(list((self.state / "jobs").glob("j*.json"))), 8)
        self.assertTrue((self.state / "reports" / "daily" / "2026-10-23.json").exists())
        ev = [json.loads(x) for x in (self.state / "events.jsonl").read_text().splitlines()]
        self.assertTrue(any(e["kind"] == "scheduled_run" and "daily run ok" in e["message"] for e in ev))

    def test_b_data_and_forward_are_skipped_with_reasons_when_not_requested_or_not_possible(self):
        s = self.steps()
        self.assertEqual((s["data"]["status"], s["forward"]["status"]), ("skipped", "skipped"))
        self.assertIn("--refresh-data", s["data"]["detail"])
        self.assertIn("--forward", s["forward"]["detail"])
        daily_run.main(self.args + ["--refresh-data", "--forward"], env={}, now=NOW)
        s = self.steps(json.loads((self.state / "reports" / "daily" / "latest.json").read_text()))
        self.assertIn("MASSIVE_API_KEY is not set", s["data"]["detail"])
        self.assertIn("no snapshot for IWM, QQQ, SPY, TLT", s["forward"]["detail"])

    def test_c_terms_consent_is_required_and_the_key_never_reaches_the_report(self):
        daily_run.main(self.args + ["--refresh-data"], env={"MASSIVE_API_KEY": KEY}, now=NOW)
        text = (self.state / "reports" / "daily" / "latest.json").read_text()
        self.assertIn("LQL_MASSIVE_TERMS_OK=yes", self.steps(json.loads(text))["data"]["detail"])
        self.assertNotIn(KEY, text)
        self.assertNotIn(KEY, (self.state / "events.jsonl").read_text())

    def test_d_a_second_pass_reuses_identical_experiments_and_tunes_nothing(self):
        daily_run.main(self.args, env={}, now=NOW)
        rows = self.steps(json.loads((self.state / "reports" / "daily" / "latest.json").read_text()))["research"]["results"]
        self.assertTrue(all(r["cached"] for r in rows))
        self.assertEqual({r["experiment"] for r in rows},
                         {r["experiment"] for r in self.steps()["research"]["results"]})

    def test_e_a_second_concurrent_pass_is_refused(self):
        lock = open(self.state / "daily_run.lock", "w")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            self.assertEqual(daily_run.main(self.args, env={}, now=NOW), 3)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
            lock.close()

    def test_g_a_control_room_running_older_code_is_not_used(self):
        from lql import code_fingerprint
        from lql.lab import Lab

        class Server:
            def __init__(self, fp):
                self.fp = fp

            def status(self):
                return {"execution_mode": "SIMULATED", "code_fingerprint": self.fp}
        lab = Lab(state_dir=self.tmp / "g")
        jobs, via, problem = daily_run.pick_jobs(Server("0ld"), lab)
        self.assertEqual((jobs, via), (None, "control room server"))
        self.assertIn("restart it", problem)
        current = Server(code_fingerprint())
        self.assertIs(daily_run.pick_jobs(current, lab)[0], current)
        down = type("Down", (), {"status": lambda self: None})()
        jobs, via, problem = daily_run.pick_jobs(down, lab)
        self.assertEqual((via, problem), ("this process", None))
        jobs.close()

    def test_f_last_closed_session_is_yesterday_in_new_york(self):
        self.assertEqual(daily_run.last_closed_session(datetime(2026, 10, 24, 2, 0, tzinfo=timezone.utc)), "2026-10-22")


if __name__ == "__main__":
    unittest.main()
