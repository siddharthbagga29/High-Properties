import ast
import re
import unittest

from lql import ROOT
from lql.export import find_secret

CODE_DIRS = ("lql", "web", "config", "scripts", "agent_learning", "docs")
BROKER = re.compile(r"(?i)(api\.alpaca\.markets|paper-api\.alpaca|interactivebrokers\.com/v1|/v2/orders|"
                    r"tradier\.com|oanda\.com/v3|place_order\s*\()")


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

    def test_ui_has_no_order_submission_route(self):
        src = (ROOT / "lql" / "server.py").read_text()
        routes = set(re.findall(r'path == "(/api/[a-z/]+)"', src))
        self.assertEqual(routes, {"/api/backtest", "/api/paper/step", "/api/paper/archive", "/api/kill", "/api/release",
                                  "/api/status", "/api/dashboard", "/api/experiments", "/api/events", "/api/tasks",
                                  "/api/paper"})
        js = (ROOT / "web" / "app.js").read_text()
        self.assertNotIn("/api/order", js)
