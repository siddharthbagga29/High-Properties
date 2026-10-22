import http.client
import json
import time
import threading
import unittest

from lql.lab import Lab
from lql.server import serve
from tests.helpers import tmpdir


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = Lab(state_dir=tmpdir())
        cls.httpd = serve("127.0.0.1", 0, cls.lab)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        h = {"Host": f"127.0.0.1:{self.port}"}
        if body is not None:
            h.update({"Content-Type": "application/json", "X-LQL-Request": "1"})
        h.update(headers or {})
        c.request(method, path, json.dumps(body) if body is not None else None, h)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, data, r

    def test_page_and_status(self):
        st, data, _ = self.req("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"DEMO / SYNTHETIC", data)
        st, data, _ = self.req("GET", "/api/status")
        s = json.loads(data)
        self.assertEqual(s["execution_mode"], "SIMULATED")
        self.assertEqual(s["broker"], "none connected")
        self.assertIn("absent", s["live_trading"])
        st, _, _ = self.req("GET", "/static/../lql/config.py")
        self.assertEqual(st, 404)

    def test_backtest_export_and_reproducible_rerun(self):
        body = {"instrument": "DEMO-ETF-B", "strategy": "sma_trend", "params": {"fast": 50, "slow": 200}}
        st, data, _ = self.req("POST", "/api/backtest", body)
        self.assertEqual(st, 200, data)
        rec = json.loads(data)
        self.assertTrue(rec["job"].startswith("j"))                          # computed by the worker, not the HTTP thread
        st, data, _ = self.req("GET", f"/api/jobs/{rec['job']}")
        job = json.loads(data)
        self.assertEqual((job["status"], job["artifacts"][0]["id"]), ("succeeded", rec["id"]))
        st, data, _ = self.req("POST", "/api/backtest", body)
        again = json.loads(data)
        self.assertTrue(again["cached"])
        self.assertEqual(again["report"]["result_hash"], rec["report"]["result_hash"])
        self.assertEqual(len(self.lab.experiments()), len({e["id"] for e in self.lab.experiments()}))
        st, data, r = self.req("GET", f"/api/experiment/{rec['id']}.csv")
        self.assertEqual(st, 200)
        self.assertTrue(data.startswith(b"date,equity"))
        self.assertIn("attachment", r.getheader("Content-Disposition"))
        st, data, _ = self.req("GET", f"/api/dashboard?experiment={rec['id']}")
        d = json.loads(data)
        self.assertEqual(d["experiment"]["report"]["net"], rec["report"]["net"])  # dashboard shows backend numbers

    def test_health_and_monte_carlo_via_api(self):
        st, data, _ = self.req("GET", "/api/health")
        h = json.loads(data)
        for k in ("http", "api", "worker", "queue", "research_engine", "data_sources", "model_provider"):
            self.assertIn(k, h)
        self.assertIn(h["worker"]["state"], ("up", "busy"))
        self.assertEqual(h["data_sources"]["external"]["massive api key"], "not configured")
        body = {"instrument": "DEMO-ETF-A", "strategy": "sma_trend", "params": {"fast": 25, "slow": 110}}
        rec = json.loads(self.req("POST", "/api/backtest", body)[1])
        st, data, _ = self.req("POST", "/api/jobs", {"kind": "montecarlo", "params": {"experiment": rec["id"], "paths": 200}})
        self.assertEqual(st, 200, data)
        jid = json.loads(data)["id"]
        for _ in range(200):
            job = json.loads(self.req("GET", f"/api/jobs/{jid}")[1])
            if job["status"] in ("succeeded", "failed"):
                break
            time.sleep(0.05)
        self.assertEqual(job["status"], "succeeded", job)
        mid = job["artifacts"][0]["id"]
        st, data, _ = self.req("GET", f"/api/montecarlo/{mid}")
        self.assertEqual(json.loads(data)["paths"], 200)
        self.assertIn(mid, [r["id"] for r in json.loads(self.req("GET", "/api/montecarlo")[1])])
        st, _, _ = self.req("POST", "/api/jobs", {"kind": "montecarlo", "params": {"experiment": rec["id"], "paths": 10}})
        self.assertEqual(st, 400)
        st, _, _ = self.req("GET", "/api/montecarlo/..%2Fsecrets")
        self.assertEqual(st, 400)

    def test_paper_and_kill_switch_via_api(self):
        st, data, _ = self.req("POST", "/api/paper/step", {"steps": 30})
        self.assertEqual(st, 200, data)
        st, data, _ = self.req("POST", "/api/kill", {"reason": "api test"})
        self.assertEqual(st, 200)
        self.assertTrue(json.loads(self.req("GET", "/api/status")[1])["kill_switch"])
        st, _, _ = self.req("POST", "/api/release", {"by": ""})
        self.assertEqual(st, 400)
        st, _, _ = self.req("POST", "/api/release", {"by": "founder"})
        self.assertEqual(st, 200)

    def test_csrf_host_and_size_guards(self):
        st, _, _ = self.req("POST", "/api/kill", None, {"Content-Type": "application/json"})
        self.assertEqual(st, 403)
        st, _, _ = self.req("GET", "/api/status", None, {"Host": "evil.example:80"})
        self.assertEqual(st, 403)
        st, _, _ = self.req("POST", "/api/backtest", {"params": {"fast": "1; rm -rf /"}})
        self.assertEqual(st, 400)
        st, _, _ = self.req("POST", "/api/paper/archive", {})
        self.assertEqual(st, 400)  # destructive-ish action needs explicit confirmation

    def test_refuses_public_bind(self):
        with self.assertRaises(SystemExit):
            serve("0.0.0.0", 0, self.lab)
