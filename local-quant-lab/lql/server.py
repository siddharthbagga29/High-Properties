"""Localhost-only HTTP server for the control room. Standard library only.

Binds 127.0.0.1 by default and refuses any other bind address unless --i-understand-public is passed (it is not
recommended and not documented as supported). Rejects requests whose Host header is not localhost (DNS-rebinding
guard). State-changing requests must be POST with Content-Type application/json and the X-LQL-Request header
(simple CSRF guard), and bodies are capped at 64 KB.
"""
import argparse
import csv
import io
import json
import mimetypes
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from . import ROOT
from . import console
from .jobs import JobRunner, JobError
from .lab import Lab, LabError

WEB = ROOT / "web"
MAX_BODY = 64 * 1024
ALLOWED_HOSTS = ("127.0.0.1", "localhost", "[::1]")


def experiment_csv(rec):
    s = rec["report"]["series"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "equity", "gross_equity", "benchmark_equity", "underwater", "exposure"])
    for row in zip(s["dates"], s["equity"], s["gross_equity"], s["benchmark_equity"], s["underwater"], s["exposure"]):
        w.writerow(row)
    w.writerow([])
    w.writerow(["fill_date", "decision_date", "side", "qty", "price", "ref_price", "commission", "spread_slippage"])
    for f in rec["report"]["fills"]:
        w.writerow([f["date"], f["decision_date"], f["side"], f["qty"], f["price"], f["ref_price"], f["commission"],
                    f["spread_slippage"]])
    return buf.getvalue()


def make_handler(lab, jobs):
    class Handler(BaseHTTPRequestHandler):
        server_version = "LocalQuantLab"

        def log_message(self, fmt, *args):  # keep the console quiet; events.jsonl is the audit trail
            pass

        def _host_ok(self):
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0] if not (self.headers.get("Host") or "").startswith("[") \
                else (self.headers.get("Host") or "").split("]")[0] + "]"
            return host in ALLOWED_HOSTS

        def _send(self, code, body, ctype="application/json", extra=None):
            data = body if isinstance(body, bytes) else (body if isinstance(body, str) else
                                                         json.dumps(body, default=str)).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                             "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def _err(self, code, msg):
            self._send(code, {"error": msg})

        def do_GET(self):
            if not self._host_ok():
                return self._err(403, "host not allowed")
            u = urlparse(self.path)
            q = parse_qs(u.query)
            try:
                if u.path in ("/", "/index.html"):
                    return self._static("index.html")
                if u.path.startswith("/static/"):
                    return self._static(u.path[len("/static/"):])
                if u.path == "/api/status":
                    return self._send(200, lab.status())
                if u.path == "/api/dashboard":
                    return self._send(200, lab.dashboard(q.get("experiment", [None])[0]))
                if u.path == "/api/experiments":
                    return self._send(200, lab.experiments())
                if u.path.startswith("/api/experiment/"):
                    eid = u.path.rsplit("/", 1)[1]
                    if eid.endswith(".csv"):
                        rec = lab.get_experiment(eid[:-4])
                        return self._send(200, experiment_csv(rec), "text/csv",
                                          {"Content-Disposition": f'attachment; filename="experiment-{rec["id"]}.csv"'})
                    if eid.endswith(".json"):
                        rec = lab.get_experiment(eid[:-5])
                        return self._send(200, json.dumps(rec, indent=1, default=str), "application/json",
                                          {"Content-Disposition": f'attachment; filename="experiment-{rec["id"]}.json"'})
                    return self._send(200, lab.get_experiment(eid))
                if u.path == "/api/events":
                    return self._send(200, lab.events.read(limit=500))
                if u.path == "/api/tasks":
                    return self._send(200, lab.tasks.summary())
                if u.path == "/api/paper":
                    return self._send(200, lab.paper_state())
                if u.path == "/api/overview":
                    return self._send(200, console.overview(lab, jobs))
                if u.path == "/api/graph":
                    return self._send(200, console.graph(lab, jobs))
                if u.path == "/api/data":
                    return self._send(200, console.data_sources(lab))
                if u.path == "/api/data/series":
                    return self._send(200, console.series(lab, q.get("source", ["synthetic"])[0],
                                                          q.get("instrument", ["DEMO-ETF-A"])[0]))
                if u.path == "/api/research":
                    return self._send(200, console.research(lab))
                if u.path == "/api/forward":
                    return self._send(200, console.forward_logs(lab))
                if u.path == "/api/system":
                    return self._send(200, console.system(lab, jobs))
                if u.path == "/api/jobs":
                    return self._send(200, jobs.list())
                if u.path == "/api/pulse":
                    since = int(q.get("since", ["0"])[0] or 0)
                    evts = lab.events.read()
                    return self._send(200, {"events_total": len(evts), "events": evts[since:][-100:] if since else [],
                                            "jobs": jobs.list()[:12], "status": lab.status()})
                return self._err(404, "not found")
            except (LabError, JobError, ValueError, console.ProviderError) as e:
                return self._err(400, str(e))

        def do_POST(self):
            if not self._host_ok():
                return self._err(403, "host not allowed")
            if self.headers.get("X-LQL-Request") != "1" or \
                    not (self.headers.get("Content-Type") or "").startswith("application/json"):
                return self._err(403, "missing X-LQL-Request header or JSON content type")
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self._err(413, "body too large")
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError("body must be an object")
            except ValueError as e:
                return self._err(400, f"bad JSON: {e}")
            path = urlparse(self.path).path
            try:
                if path == "/api/backtest":
                    params = body.get("params") or {}
                    if not isinstance(params, dict) or not all(isinstance(v, int) for v in params.values()):
                        raise LabError("params must be an object of integers")
                    return self._send(200, lab.experiment(str(body.get("instrument", "DEMO-ETF-A")),
                                                          str(body.get("strategy", "sma_trend")), params,
                                                          str(body.get("source", "synthetic"))))
                if path == "/api/paper/step":
                    steps = int(body.get("steps", 20))
                    if not 1 <= steps <= 1300:
                        raise LabError("steps must be 1..1300")
                    return self._send(200, lab.paper_step(steps, str(body.get("instrument", "DEMO-ETF-A")),
                                                          str(body.get("strategy", "sma_trend")),
                                                          bool(body.get("corrupt_next", False))))
                if path == "/api/paper/archive":
                    if body.get("confirm") != "archive":
                        raise LabError('send {"confirm": "archive"} to archive the paper ledger')
                    return self._send(200, {"archived_to": lab.paper_archive()})
                if path == "/api/jobs":
                    kind = str(body.get("kind", ""))
                    params = body.get("params") or {}
                    if not isinstance(params, dict):
                        raise LabError("params must be an object")
                    if kind == "backtest":
                        inner = params.get("params") or {}
                        if not isinstance(inner, dict) or not all(isinstance(v, int) for v in inner.values()):
                            raise LabError("params.params must be an object of integers")
                        params = {"instrument": str(params.get("instrument", "DEMO-ETF-A")),
                                  "strategy": str(params.get("strategy", "sma_trend")),
                                  "source": str(params.get("source", "synthetic")), "params": inner}
                    return self._send(200, jobs.submit(kind, body.get("target"), params))
                if path == "/api/jobs/cancel":
                    return self._send(200, jobs.cancel(str(body.get("id", ""))))
                if path == "/api/kill":
                    return self._send(200, {"cancelled": lab.kill(str(body.get("reason", "operator")))})
                if path == "/api/release":
                    by = str(body.get("by", "")).strip()
                    if not by:
                        raise LabError("name the human operator releasing the kill switch")
                    lab.release(by)
                    return self._send(200, {"released_by": by})
                return self._err(404, "not found")
            except (LabError, JobError, KeyError, ValueError, TypeError) as e:
                return self._err(400, f"{type(e).__name__}: {e}")

        def _static(self, name):
            p = (WEB / name).resolve()
            if WEB.resolve() not in p.parents or not p.is_file():
                return self._err(404, "not found")
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            return self._send(200, p.read_bytes(), ctype)

    return Handler


def serve(host="127.0.0.1", port=8765, lab=None, allow_public=False):
    if host not in ("127.0.0.1", "localhost", "::1") and not allow_public:
        raise SystemExit(f"refusing to bind {host}: this server is localhost-only")
    lab = lab or Lab()
    jobs = JobRunner(lab)
    httpd = ThreadingHTTPServer((host, port), make_handler(lab, jobs))
    httpd.jobs = jobs
    lab.events.emit("server_start", f"control room on http://{host}:{httpd.server_address[1]}")
    return httpd


def main(argv=None):
    ap = argparse.ArgumentParser(description="Local Quant Lab control room (localhost only)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--state-dir", help="use another state directory (for demos and browser checks); default state/")
    ap.add_argument("--i-understand-public", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    lab = Lab(state_dir=a.state_dir) if a.state_dir else None
    httpd = serve(a.host, a.port, lab=lab, allow_public=a.i_understand_public)
    print(f"Local Quant Lab on http://{a.host}:{httpd.server_address[1]}  (SIMULATED, no broker, Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
