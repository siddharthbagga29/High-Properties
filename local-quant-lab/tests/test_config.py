import json
import unittest

from lql import config
from tests.helpers import SETTINGS_DICT, tmpdir


class ConfigTests(unittest.TestCase):
    def test_shipped_settings_load_simulated(self):
        s = config.load()
        self.assertEqual(s.execution_mode, "SIMULATED")
        self.assertFalse(s.risk.allow_short)

    def test_missing_file_fails_closed(self):
        with self.assertRaises(config.ConfigError):
            config.load(tmpdir() / "nope.json")

    def test_missing_key_and_live_mode_rejected(self):
        d = json.loads(json.dumps(SETTINGS_DICT))
        del d["risk"]["max_order_qty"]
        with self.assertRaises(config.ConfigError):
            config.parse(d)
        d = json.loads(json.dumps(SETTINGS_DICT))
        d["execution_mode"] = "LIVE"
        with self.assertRaises(config.ConfigError):
            config.parse(d)

    def test_tighten_only_makes_limits_stricter(self):
        lim = config.load().risk
        new, applied, refused = config.tighten(lim, max_order_qty=10, max_drawdown=0.9, allowed_instruments=["EVIL"])
        self.assertEqual(new.max_order_qty, 10)
        self.assertEqual(new.max_drawdown, lim.max_drawdown)
        self.assertIn("max_drawdown", refused)
        self.assertIn("allowed_instruments", refused)
