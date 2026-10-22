import ast
import hashlib
import re
import unittest

from lql import ROOT
from lql.export import find_secret

CODE_DIRS = ("lql", "web", "config", "scripts", "agent_learning", "docs")
BROKER = re.compile(r"(?i)(api\.alpaca\.markets|paper-api\.alpaca|interactivebrokers\.com/v1|/v2/orders|"
                    r"tradier\.com|oanda\.com/v3|place_order\s*\()")
VENDOR = ROOT / "web" / "vendor" / "three"
VENDOR_SHA256 = {   # three@0.180.0 (MIT); see web/vendor/three/VENDOR.md
    "three.core.min.js": "61ba0df005b05991361d040d8ff670e1aadfd0ce7aeebd1fdb0725957a8957de",
    "three.module.min.js": "e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6",
    "OrbitControls.js": "6c860c6b342200f8aef65493319c12bfb2d652107355b1d25eb2154371128391",
}


def files():
    for d in CODE_DIRS:
        for p in (ROOT / d).rglob("*"):
            if p.is_file() and p.suffix in (".py", ".js", ".html", ".css", ".json", ".md") and "__pycache__" not in p.parts:
                yield p


class SecurityAudit(unittest.TestCase):
    def test_no_secrets_in_tracked_sources(self):
        hits = [str(p.relative_to(ROOT)) for p in files() if find_secret(p.read_bytes())]
        self.assertEqual(hits, [])

    def test_no_live_broker_endpoints_in_code(self):
        hits = [str(p.relative_to(ROOT)) for p in files() if p.suffix in (".py", ".js") and BROKER.search(p.read_text())]
        self.assertEqual(hits, [])

    def test_no_live_mode_exists(self):
        from lql import config
        self.assertNotIn("LIVE", config.EXECUTION_MODES)
        self.assertEqual(config.load().execution_mode, "SIMULATED")

    def test_strategies_cannot_reach_shell_network_or_files(self):
        tree = ast.parse((ROOT / "lql" / "strategies" / "__init__.py").read_text())
        mods = {a.name.split(".")[0] for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
        mods |= {(n.module or "").split(".")[0] for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
        self.assertFalse(mods & {"os", "subprocess", "socket", "urllib", "http", "shutil", "pathlib", "requests"}, mods)
        calls = {n.func.id for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
        self.assertFalse(calls & {"open", "eval", "exec", "__import__"}, calls)

    def test_hermes_adapter_and_trading_modules_are_isolated_from_each_other(self):
        def imported(path):
            tree = ast.parse(path.read_text())
            mods = set()
            for n in ast.walk(tree):
                if isinstance(n, ast.ImportFrom):
                    mods.add(((n.module or "") or "").split(".")[-1])
                    mods |= {a.name for a in n.names}
                elif isinstance(n, ast.Import):
                    mods |= {a.name.split(".")[-1] for a in n.names}
            return mods
        adapter = imported(ROOT / "lql" / "agents" / "hermes_adapter.py")
        self.assertFalse(adapter & {"walkforward", "forward", "freeze", "evaluate_holdout", "ForwardRunner", "portfolio",
                                    "run_portfolio", "MultiPaperSession", "RiskEngine", "Ledger"}, adapter)
        for rel in ("backtest/engine.py", "backtest/portfolio.py", "research/walkforward.py", "execution/forward.py",
                    "execution/paper.py", "execution/ledger.py", "risk/__init__.py"):
            mods = imported(ROOT / "lql" / rel)
            self.assertFalse(mods & {"agents", "hermes_adapter", "HermesAdapter", "skills", "SkillLab"}, (rel, mods))

    def test_ui_has_no_order_submission_route(self):
        src = (ROOT / "lql" / "server.py").read_text()
        routes = set(re.findall(r'path == "(/api/[a-z/]+)"', src))
        self.assertEqual(routes, {"/api/backtest", "/api/paper/step", "/api/paper/archive", "/api/kill", "/api/release",
                                  "/api/status", "/api/dashboard", "/api/experiments", "/api/events", "/api/tasks",
                                  "/api/paper", "/api/overview", "/api/graph", "/api/data", "/api/data/series",
                                  "/api/research", "/api/forward", "/api/system", "/api/jobs", "/api/pulse",
                                  "/api/jobs/cancel", "/api/health", "/api/montecarlo"})
        for js in (ROOT / "web").rglob("*.js"):
            src = js.read_text()
            self.assertNotIn("/api/order", src, js)
            self.assertNotIn("/api/holdout", src, js)
            if VENDOR in js.parents:     # third-party code: pinned by hash below; its only URL is an XML namespace
                self.assertEqual(set(re.findall(r"https?://[\w./-]+", src)) - {"http://www.w3.org/1999/xhtml"}, set(), js)
                continue
            self.assertNotRegex(src, r"https?://(?!127\.0\.0\.1|localhost)", js)   # no remote calls or assets

    def test_vendored_three_js_is_pinned(self):
        files = {p.name for p in VENDOR.iterdir()}
        self.assertEqual(files, set(VENDOR_SHA256) | {"LICENSE", "VENDOR.md"})
        for name, digest in VENDOR_SHA256.items():
            self.assertEqual(hashlib.sha256((VENDOR / name).read_bytes()).hexdigest(), digest, name)
        notes = (VENDOR / "VENDOR.md").read_text()
        for name, digest in VENDOR_SHA256.items():
            self.assertIn(f"{digest}  {name}", notes)
        self.assertIn("MIT License", (VENDOR / "LICENSE").read_text())
        # loaded from the local copy only, never a CDN
        self.assertIn("from './three.module.min.js'", (VENDOR / "OrbitControls.js").read_text())
        floor = (ROOT / "web" / "js" / "scene" / "floor.js").read_text()
        self.assertIn('from "../../vendor/three/three.module.min.js"', floor)
