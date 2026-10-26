"""Credentials file loading and the read-only connectivity/signal check (scripts/check_connectivity.py)."""
import importlib.util
import json
import os
import unittest
from pathlib import Path

from lql import ROOT, envfile
from tests.helpers import tmpdir

spec = importlib.util.spec_from_file_location("check_connectivity", ROOT / "scripts" / "check_connectivity.py")
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

SECRET = "sEcReT-value-never-printed"


def env_file(text, mode=0o600):
    p = Path(tmpdir()) / ".env"
    p.write_text(text)
    os.chmod(p, mode)
    return p


class EnvFileTests(unittest.TestCase):
    def test_loads_allowed_names_only_and_the_environment_wins(self):
        p = env_file(f"# comment\nexport MASSIVE_API_KEY=\"{SECRET}\"\nPATH=/evil\nAPCA_API_KEY_ID=PKabc\n"
                     f"FRED_API_KEY=\nBEA_API_USERID=fromfile\n")
        env = {"BEA_API_USERID": "from-shell"}
        rep = envfile.load(p, env)
        self.assertEqual(env["MASSIVE_API_KEY"], SECRET)                    # quotes and `export` handled
        self.assertEqual(env["ALPACA_PAPER_KEY_ID"], "PKabc")              # Alpaca's own name accepted as alias
        self.assertEqual(env["BEA_API_USERID"], "from-shell")              # environment (Keychain) wins
        self.assertNotIn("PATH", env)                                       # not on the allowlist
        self.assertNotIn("FRED_API_KEY", env)                               # empty values are not set
        self.assertEqual(rep["ignored"], ["PATH"])
        self.assertNotIn(SECRET, json.dumps(rep) + envfile.describe(rep))   # names only, never values

    def test_a_file_other_users_can_read_is_refused(self):
        env = {}
        rep = envfile.load(env_file(f"MASSIVE_API_KEY={SECRET}\n", 0o644), env)
        self.assertIn("chmod 600", rep["refused"])
        self.assertEqual(env, {})

    def test_search_order_and_repository_env_files_are_git_ignored(self):
        self.assertEqual(envfile.candidates({"LQL_ENV_FILE": "~/x.env"})[0], Path("~/x.env").expanduser())
        self.assertEqual(envfile.candidates({})[1:], [ROOT.parent / ".env", ROOT / ".env"])
        for f in (ROOT.parent / ".gitignore", ROOT / ".gitignore"):
            self.assertIn(".env", f.read_text().split())


class SignalTests(unittest.TestCase):
    def test_signals_come_from_snapshots_with_their_data_state_and_missing_ones_are_reported(self):
        from lql.data.providers import SyntheticProvider, write_snapshot
        from lql.data.schema import SourceInfo
        d = tmpdir()
        write_snapshot("SPY", SyntheticProvider(n_days=400).bars("SPY"),
                       SourceInfo("massive", "HISTORICAL_DOWNLOADED", "t", adjusted="dividend_adjusted_unverified"), d)
        rows = cc.signals(d, symbols=("SPY", "QQQ"))
        spy = [r for r in rows if r["instrument"] == "SPY"]
        self.assertEqual([r["strategy"] for r in spy], ["sma_trend", "vol_scaled_trend"])
        self.assertTrue(all(0 <= r["target_weight"] <= 1 and r["data_state"] == "PROVISIONAL" for r in spy))
        self.assertIn("error", [r for r in rows if r["instrument"] == "QQQ"][0])


if __name__ == "__main__":
    unittest.main()
