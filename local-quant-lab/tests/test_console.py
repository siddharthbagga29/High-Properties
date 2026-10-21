"""Console (Perspective Engine UI) back end: read models, job runner and the routes the UI uses."""
import http.client
import json
import os
import shutil
import subprocess
import threading
import time
import unittest

from lql import ROOT
from lql.jobs import JobRunner, JobError, MAX_QUEUE
from lql.lab import Lab
from lql.orchestrator import TaskGraph
from lql.server import serve
from tests.helpers import tmpdir


def lab_with_tasks():
    d = tmpdir()
    shutil.copy(ROOT / "state" / "current_state.json", d / "current_state.json")
    return Lab(state_dir=d)


def wait(runner, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if all(j["status"] not in ("queued", "running") for j in runner.list()):
            return runner.list()
        time.sleep(0.1)
    raise AssertionError("jobs did not finish")


class JobRunnerTests(unittest.TestCase):
    def test_recheck_runs_tests_records_measurements_and_never_changes_task_status(self):
        lab = lab_with_tasks()
        before = TaskGraph(lab.tasks.path).get("M0-skeleton")
        r = JobRunner(lab)
        j = r.submit("recheck", "M0-skeleton")
        self.assertIn(j["status"], ("queued", "running"))
        done = wait(r)[0]
        self.assertEqual(done["status"], "done", done)
        self.assertGreater(done["result"]["passed"], 0)
        self.assertEqual(done["result"]["failed"], 0)
        self.assertIsNotNone(done["duration_s"])
        self.assertIsNotNone(done["cpu_s"])
        after = TaskGraph(lab.tasks.path).get("M0-skeleton")
        self.assertEqual(after["status"], before["status"])
        self.assertEqual(after["history"], before["history"])
        kinds = [e["kind"] for e in lab.events.read()]
        for k in ("job_queued", "job_started", "job_finished"):
            self.assertIn(k, kinds)
        r.stop()

    def test_refusals(self):
        lab = lab_with_tasks()
        r = JobRunner(lab, start=False)
        with self.assertRaises(JobError):
            r.submit("recheck", "H1-hermes-mac")          # founder task runs on the Mac
        with self.assertRaises(JobError):
            r.submit("recheck", "nope")
        with self.assertRaises(JobError):
            r.submit("holdout", "x")                      # no such kind: the holdout is CLI-only
        with self.assertRaises(JobError):
            r.submit("forward", "x")
        r.submit("recheck", "M0-skeleton")
        with self.assertRaises(JobError):
            r.submit("recheck", "M0-skeleton")            # identical job already queued
        lab.tasks.tasks["M1-data"]["acceptance"] = ["rm -rf /"]
        with self.assertRaises(JobError):
            r.submit("recheck", "M1-data")                # only unittest/script commands may run

    def test_queue_is_bounded_and_queued_jobs_cancel(self):
        lab = lab_with_tasks()
        r = JobRunner(lab, start=False)                   # no worker: everything stays queued
        ids = [r.submit("backtest", None, {"instrument": "DEMO-ETF-A", "strategy": "sma_trend",
                                             "params": {"fast": 10 + i, "slow": 100}})["id"] for i in range(MAX_QUEUE)]
        with self.assertRaises(JobError):
            r.submit("backtest", None, {"params": {"fast": 99, "slow": 100}})
        c = r.cancel(ids[0])
        self.assertEqual(c["status"], "cancelled")
        with self.assertRaises(JobError):
            r.cancel(ids[0])
        self.assertIn("job_cancelled", [e["kind"] for e in lab.events.read()])

    def test_running_recheck_can_be_cancelled_and_failure_is_a_regression_event(self):
        lab = lab_with_tasks()
        lab.tasks.tasks["M0-skeleton"]["acceptance"] = ["python3 -m unittest tests.test_forward"]   # slow
        r = JobRunner(lab)
        j = r.submit("recheck", "M0-skeleton")
        for _ in range(100):
            if r.get(j["id"])["status"] == "running" and r._proc is not None:
                break
            time.sleep(0.05)
        r.cancel(j["id"])
        done = wait(r)[0]
        self.assertEqual(done["status"], "cancelled")
        lab.tasks.tasks["M1-data"]["acceptance"] = ["python3 -m unittest tests.test_does_not_exist"]
        r.submit("recheck", "M1-data")
        bad = wait(r)[0]
        self.assertEqual(bad["status"], "failed")
        self.assertIn("acceptance_regression", [e["kind"] for e in lab.events.read()])
        self.assertEqual(TaskGraph(lab.tasks.path).get("M1-data")["status"], "done_verified")  # not reopened
        r.stop()

    def test_backtest_job_uses_the_lab_and_reuses_identical_runs(self):
        lab = lab_with_tasks()
        r = JobRunner(lab)
        p = {"instrument": "DEMO-ETF-B", "strategy": "sma_trend", "source": "synthetic", "params": {"fast": 20, "slow": 100}}
        r.submit("backtest", None, p)
        first = wait(r)[0]
        self.assertEqual(first["status"], "done")
        r.submit("backtest", None, p)
        second = wait(r)[0]
        self.assertTrue(second["result"]["cached"])
        self.assertEqual(second["result"]["experiment"], first["result"]["experiment"])
        r.stop()


class ConsoleApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = lab_with_tasks()
        cls.httpd = serve("127.0.0.1", 0, cls.lab)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.jobs.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def req(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        h = {"Host": f"127.0.0.1:{self.port}"}
        if body is not None:
            h.update({"Content-Type": "application/json", "X-LQL-Request": "1"})
        c.request(method, path, json.dumps(body) if body is not None else None, h)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, (json.loads(data) if data[:1] in (b"{", b"[") else data)

    def test_overview_is_honest_about_data_safety_and_roles(self):
        st, o = self.req("GET", "/api/overview")
        self.assertEqual(st, 200)
        s = o["status"]
        self.assertEqual(s["execution_mode"], "SIMULATED")
        self.assertIn("absent", s["live_trading"])
        self.assertIn("synthetic only", s["data_mode"])
        self.assertNotIn("live", s["data_mode"].replace("not live", ""))
        self.assertEqual({r["key"] for r in o["roles"]},
                         {"supervisor", "engineer", "reviewer", "founder", "critic", "risk", "data", "hermes"})
        self.assertTrue(any(d["ref"] == "H1-hermes-mac" for d in o["decisions"]))   # human gate stays open
        self.assertTrue(any(d["ref"] == "snapshots" for d in o["decisions"]))
        self.assertTrue(all(not r["active"] for r in o["roles"]))                   # nothing runs: nothing glows

    def test_graph_matches_the_task_file(self):
        st, g = self.req("GET", "/api/graph")
        tg = TaskGraph(self.lab.tasks.path)
        self.assertEqual({n["id"] for n in g["nodes"]}, set(tg.tasks))
        self.assertEqual(len(g["edges"]), sum(len(t["deps"]) for t in tg.tasks.values()))
        by = {n["id"]: n for n in g["nodes"]}
        self.assertEqual(by["M0-skeleton"]["level"], 0)
        self.assertGreater(by["M7-security-audit"]["level"], by["M6-handoff"]["level"])
        self.assertIn("M1-data", by["M0-skeleton"]["dependents"])
        self.assertFalse(by["H1-hermes-mac"]["recheckable"])
        self.assertEqual(by["H1-hermes-mac"]["status"], "needs_human")

    def test_data_research_forward_system(self):
        st, d = self.req("GET", "/api/data")
        self.assertEqual(st, 200)
        classes = {x["data_class"] for x in d["datasets"]}
        self.assertEqual(classes, {"synthetic"})
        self.assertIn("not supported", d["classes"]["live"])
        st, s = self.req("GET", "/api/data/series?source=synthetic&instrument=DEMO-ETF-A")
        self.assertEqual(s["data_class"], "synthetic")
        self.assertEqual(len(s["dates"]), len(s["close"]))
        st, _ = self.req("GET", "/api/data/series?source=synthetic&instrument=SPY")
        self.assertEqual(st, 400)
        st, _ = self.req("GET", "/api/data/series?source=snapshot&instrument=../../config/settings")
        self.assertEqual(st, 400)
        st, r = self.req("GET", "/api/research")
        self.assertIn("CLI", r["ui_policy"])
        st, f = self.req("GET", "/api/forward")
        self.assertEqual(f["logs"], [])
        os.environ["STOOQ_API_KEY"] = "zzSECRETzz123"
        try:
            for path in ("/api/system", "/api/data", "/api/overview"):
                st, body = self.req("GET", path)
                self.assertNotIn("zzSECRETzz123", json.dumps(body))
            st, sysd = self.req("GET", "/api/system")
            self.assertEqual(sysd["credentials"]["stooq api key (env)"], "configured")
        finally:
            del os.environ["STOOQ_API_KEY"]
        self.assertEqual(sysd["execution_mode"], "SIMULATED")
        self.assertEqual([x for x in sysd["services"] if x["name"] == "broker"][0]["status"], "none")

    def test_jobs_routes_and_pulse(self):
        st, p = self.req("GET", "/api/pulse")
        n0 = p["events_total"]
        st, j = self.req("POST", "/api/jobs", {"kind": "recheck", "target": "M0-skeleton"})
        self.assertEqual(st, 200, j)
        for _ in range(200):
            st, jobs = self.req("GET", "/api/jobs")
            if jobs[0]["status"] not in ("queued", "running"):
                break
            time.sleep(0.1)
        self.assertEqual(jobs[0]["status"], "done")
        st, p = self.req("GET", f"/api/pulse?since={n0}")
        self.assertIn("job_finished", [e["kind"] for e in p["events"]])
        st, e = self.req("POST", "/api/jobs", {"kind": "recheck", "target": "H1-hermes-mac"})
        self.assertEqual(st, 400)
        st, e = self.req("POST", "/api/jobs", {"kind": "backtest", "params": {"params": {"fast": "1; rm"}}})
        self.assertEqual(st, 400)
        st, e = self.req("POST", "/api/jobs/cancel", {"id": "j999"})
        self.assertEqual(st, 400)
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)      # CSRF guard applies to jobs too
        c.request("POST", "/api/jobs", json.dumps({"kind": "recheck", "target": "M0-skeleton"}),
                  {"Host": f"127.0.0.1:{self.port}", "Content-Type": "application/json"})
        self.assertEqual(c.getresponse().status, 403)

    def test_static_modules_are_served_and_page_has_no_remote_assets(self):
        st, html = self.req("GET", "/")
        self.assertIn(b'type="module"', html)
        self.assertNotRegex(html.decode(), r"https?://")
        for path in ("/static/js/main.js", "/static/js/views/graph.js", "/static/css/tokens.css"):
            c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            c.request("GET", path, headers={"Host": f"127.0.0.1:{self.port}"})
            r = c.getresponse()
            r.read()
            self.assertEqual(r.status, 200, path)


class FrontEndUnitTests(unittest.TestCase):
    def test_node_unit_tests(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed; run: node --test web/tests/*.test.mjs")
        files = sorted(str(p) for p in (ROOT / "web" / "tests").glob("*.test.mjs"))
        r = subprocess.run([node, "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])
        self.assertIn("# fail 0", r.stdout)


if __name__ == "__main__":
    unittest.main()
