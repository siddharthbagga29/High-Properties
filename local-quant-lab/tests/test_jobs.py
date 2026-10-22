"""Durable job lifecycle (lql/jobs.py), restart recovery, health states, and the Monte Carlo bootstrap."""
import json
import math
import shutil
import time
import unittest

from lql import ROOT, console
from lql.jobs import JobRunner, JobError, BACKTEST_STAGES, STATES, TERMINAL
from lql.lab import Lab
from lql.research import montecarlo as mc
from tests.helpers import tmpdir

BT = {"instrument": "DEMO-ETF-A", "strategy": "sma_trend", "source": "synthetic", "params": {"fast": 30, "slow": 120}}


def new_lab():
    d = tmpdir()
    shutil.copy(ROOT / "state" / "current_state.json", d / "current_state.json")
    return Lab(state_dir=d)


class JobLifecycleTests(unittest.TestCase):
    def test_backtest_job_persists_every_field_the_contract_names(self):
        lab = new_lab()
        r = JobRunner(lab)
        j = r.submit("backtest", None, BT)
        self.assertIn(j["status"], ("queued", "running"))
        self.assertTrue(j["id"].startswith("j") and len(j["request_hash"]) == 16 and j["correlation_id"])
        done = r.wait(j["id"], 60)
        r.stop(wait=True)
        self.assertEqual(done["status"], "succeeded", done)
        self.assertEqual(done["progress"], {"done": len(BACKTEST_STAGES), "total": len(BACKTEST_STAGES), "unit": "stages"})
        for k in ("created_at", "started_at", "updated_at", "finished_at", "duration_s"):
            self.assertTrue(done[k], k)
        art = done["artifacts"][0]
        self.assertEqual(art["kind"], "experiment")
        self.assertTrue((lab.state / "experiments" / f"{art['id']}.json").exists())
        self.assertEqual(done["datasets"][0]["data_state"], "SYNTHETIC")
        on_disk = json.loads((lab.state / "jobs" / f"{j['id']}.json").read_text())
        self.assertEqual(on_disk["status"], "succeeded")
        kinds = [e["kind"] for e in lab.events.read()]
        self.assertEqual([k for k in kinds if k.startswith("job_")], ["job_queued", "job_started", "job_finished"])

    def test_history_survives_a_restart_and_ids_continue(self):
        lab = new_lab()
        r = JobRunner(lab)
        first = r.wait(r.submit("backtest", None, BT)["id"], 60)
        r.stop(wait=True)
        r2 = JobRunner(lab)                      # a new server process reads the same state directory
        self.assertEqual(r2.get(first["id"])["status"], "succeeded")
        self.assertEqual(r2.get(first["id"])["artifacts"], first["artifacts"])
        again = r2.submit("backtest", None, BT)
        self.assertEqual(int(again["id"][1:]), int(first["id"][1:]) + 1)
        self.assertTrue(r2.wait(again["id"], 60)["result"]["cached"])     # identical input: reused, not recomputed
        r2.stop(wait=True)

    def test_restart_marks_an_interrupted_run_failed_and_requeues_never_started_work(self):
        lab = new_lab()
        r = JobRunner(lab, start=False)                     # no worker: jobs stay queued
        a = r.submit("backtest", None, BT)
        b = r.submit("backtest", None, {**BT, "params": {"fast": 40, "slow": 150}})
        # simulate a crash while `a` was running: the file says running, nobody finished it
        p = lab.state / "jobs" / f"{a['id']}.json"
        rec = json.loads(p.read_text())
        rec.update(status="running", started_at=rec["created_at"], stage="running engine")
        p.write_text(json.dumps(rec))
        r2 = JobRunner(lab)
        ja = r2.get(a["id"])
        self.assertEqual(ja["status"], "failed")                # never "succeeded": it did not complete
        self.assertTrue(ja["interrupted"])
        self.assertIn("interrupted", ja["error"])
        jb = r2.wait(b["id"], 60)
        self.assertEqual(jb["status"], "succeeded")
        self.assertEqual(jb["attempt"], 2)
        kinds = [e["kind"] for e in lab.events.read()]
        self.assertIn("job_interrupted", kinds)
        self.assertIn("job_recovered", kinds)
        r2.stop(wait=True)

    def test_worker_down_is_reported_and_queued_work_is_not_shown_as_running(self):
        lab = new_lab()
        r = JobRunner(lab, start=False)
        h = r.health()
        self.assertEqual(h["worker"]["state"], "down")
        self.assertFalse(h["worker"]["thread_alive"])
        j = r.submit("backtest", None, BT)
        time.sleep(0.3)
        self.assertEqual(r.get(j["id"])["status"], "queued")
        self.assertEqual(r.get(j["id"])["stage"], "waiting for the worker")
        full = console.health(lab, r)
        self.assertEqual(full["http"]["state"], "up")
        self.assertEqual(full["worker"]["state"], "down")      # the server being up says nothing about the worker
        r.start()
        self.assertEqual(r.wait(j["id"], 60)["status"], "succeeded")
        self.assertIn(r.health()["worker"]["state"], ("up", "busy"))
        r.stop(wait=True)
        self.assertEqual(r.health()["worker"]["state"], "down")

    def test_states_are_only_the_documented_ones_and_failures_are_recorded(self):
        lab = new_lab()
        r = JobRunner(lab)
        j = r.submit("backtest", None, {**BT, "strategy": "no_such_strategy"})
        done = r.wait(j["id"], 60)
        r.stop(wait=True)
        self.assertEqual(done["status"], "failed")
        self.assertTrue(done["error"])
        self.assertEqual(done["artifacts"], [])
        self.assertIn(done["status"], STATES)
        self.assertEqual(set(TERMINAL), {"succeeded", "failed", "cancelled"})
        self.assertIn("job_failed", [e["kind"] for e in lab.events.read()])

    def test_unreadable_job_file_is_reported_not_fatal(self):
        lab = new_lab()
        (lab.state / "jobs").mkdir(parents=True)
        (lab.state / "jobs" / "j7.json").write_text("{not json")
        r = JobRunner(lab, start=False)
        self.assertEqual(r.list(), [])
        self.assertIn("job_store_error", [e["kind"] for e in lab.events.read()])


class MonteCarloTests(unittest.TestCase):
    def test_request_validation(self):
        for bad in ({"experiment": "../x"}, {"experiment": "abc", "paths": 5}, {"experiment": "abc", "paths": 10**6},
                    {"experiment": "abc", "block": 0}, {"experiment": "abc", "seed": -1}, {"experiment": "abc", "paths": "9"},
                    {"experiment": "abc", "paths": True}):
            with self.assertRaises(mc.MonteCarloError, msg=bad):
                mc.validate_request(bad)
        self.assertEqual(mc.validate_request({"experiment": "abc"}), {"experiment": "abc", "paths": 1000, "block": 20, "seed": 7})

    def test_bootstrap_is_seeded_and_its_arithmetic_checks_out(self):
        rets = [0.01 * math.sin(i / 7) + 0.0004 for i in range(300)]
        a = mc.bootstrap(rets, 200, 10, seed=3)
        b = mc.bootstrap(rets, 200, 10, seed=3)
        c = mc.bootstrap(rets, 200, 10, seed=4)
        self.assertEqual(a["ends"], b["ends"])
        self.assertNotEqual(a["ends"], c["ends"])
        # a block as long as the sample and wrap-around keeps every return exactly once per path: same product
        full = mc.bootstrap(rets, 50, 300, seed=1)
        prod = math.prod(1 + r for r in rets)
        for e in full["ends"]:
            self.assertAlmostEqual(e, prod, places=9)
        self.assertEqual(len(a["fan"]), len(a["checkpoints"]))
        self.assertTrue(all(len(col) == 200 for col in a["fan"]))
        self.assertTrue(all(d <= 0 for d in a["mdds"]))
        with self.assertRaises(mc.MonteCarloError):
            mc.bootstrap(rets[:15], 10, 10, seed=1)
        self.assertEqual(mc.percentile([1, 2, 3, 4], 50), 2.5)
        self.assertEqual(mc.max_drawdown([1, 2, 1, 3]), -0.5)

    def test_job_artifact_is_reproducible_cached_and_labelled(self):
        lab = new_lab()
        r = JobRunner(lab)
        exp = r.wait(r.submit("backtest", None, BT)["id"], 60)["result"]["experiment"]
        p = {"experiment": exp, "paths": 300, "block": 15, "seed": 11}
        j1 = r.wait(r.submit("montecarlo", None, p)["id"], 120)
        self.assertEqual(j1["status"], "succeeded", j1)
        art = j1["artifacts"][0]
        rec = mc.get_run(lab, art["id"])
        self.assertEqual((rec["seed"], rec["paths"], rec["block_days"]), (11, 300, 15))
        self.assertEqual(rec["input"]["data_state"], "SYNTHETIC")
        self.assertTrue(any("SYNTHETIC" in a for a in rec["assumptions"]))
        e = rec["ending"]
        self.assertLessEqual(e["p5"], e["p25"])
        self.assertLessEqual(e["p25"], e["p50"])
        self.assertLessEqual(e["p50"], e["p75"])
        self.assertLessEqual(e["p75"], e["p95"])
        self.assertEqual(sum(rec["histogram"]["counts"]), 300)
        self.assertEqual(len(rec["fan"]["p50"]), len(rec["fan"]["step"]))
        j2 = r.wait(r.submit("montecarlo", None, p)["id"], 120)
        self.assertTrue(j2["result"]["cached"])                       # same inputs: same artifact
        # recomputing from scratch gives the same numbers
        (lab.state / "montecarlo" / f"{art['id']}.json").unlink()
        j3 = r.wait(r.submit("montecarlo", None, p)["id"], 120)
        self.assertEqual(mc.get_run(lab, art["id"])["ending"], e)
        self.assertFalse(j3["result"]["cached"])
        with self.assertRaises(Exception):
            r.submit("montecarlo", None, {"experiment": "doesnotexist"})
        r.stop(wait=True)


if __name__ == "__main__":
    unittest.main()
