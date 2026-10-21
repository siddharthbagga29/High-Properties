import unittest
from dataclasses import replace
from datetime import date

from lql.data.providers import SyntheticProvider, SnapshotProvider, write_snapshot, parse_csv, StooqProvider, ProviderError
from lql.data.quality import validate
from tests.helpers import bars, tmpdir


class DataTests(unittest.TestCase):
    def test_synthetic_is_deterministic_and_labelled(self):
        p = SyntheticProvider()
        self.assertEqual(p.bars("DEMO-ETF-A"), p.bars("DEMO-ETF-A"))
        self.assertNotEqual(p.bars("DEMO-ETF-A")[5].close, p.bars("DEMO-ETF-B")[5].close)
        self.assertEqual(p.info().kind, "DEMO_SYNTHETIC")
        self.assertTrue(validate(p.bars("DEMO-ETF-A")).tradable)

    def test_quality_flags(self):
        b = bars([100, 101, 102, 103])
        dup = b + [b[-1]]
        self.assertIn("duplicate", validate(dup).counts())
        self.assertFalse(validate(dup).tradable)
        rev = [b[1], b[0]] + b[2:]
        self.assertIn("non_monotonic", validate(rev).counts())
        bad = b[:2] + [replace(b[2], high=b[2].low * 0.5)]
        self.assertIn("invalid_ohlc", validate(bad).counts())
        neg = b[:2] + [replace(b[2], close=-1.0)]
        self.assertIn("non_positive_price", validate(neg).counts())
        out = b[:2] + [replace(b[2], close=b[2].close * 1.5, high=b[2].close * 1.6)]
        self.assertIn("outlier", validate(out).counts())
        self.assertTrue(validate(out).tradable)  # outliers are flagged, not silently dropped or blocked
        stale = validate(b, as_of=date(2021, 1, 1), max_age_days=5)
        self.assertIn("stale", stale.counts())
        self.assertFalse(validate([]).tradable)

    def test_snapshot_roundtrip_and_tamper_detection(self):
        d = tmpdir()
        p = SyntheticProvider(n_days=50)
        write_snapshot("DEMO-ETF-A", p.bars("DEMO-ETF-A"), p.info(), d)
        sp = SnapshotProvider(d)
        self.assertEqual([x.close for x in sp.bars("DEMO-ETF-A")], [x.close for x in p.bars("DEMO-ETF-A")])
        csv = d / "DEMO-ETF-A.csv"
        csv.write_text(csv.read_text().replace("\n", "\n", 1) + "")
        text = csv.read_text().splitlines()
        text[3] = text[3].replace(text[3].split(",")[4], "999")
        csv.write_text("\n".join(text) + "\n")
        with self.assertRaises(ProviderError):
            sp.bars("DEMO-ETF-A")

    def test_stooq_failure_is_visible(self):
        def opener(*a, **k):
            raise OSError("offline")
        with self.assertRaises(ProviderError):
            StooqProvider(opener=opener).fetch("SPY")

    def test_parse_csv_rejects_garbage(self):
        with self.assertRaises(ProviderError):
            parse_csv("not,a,csv\n1,2", "SPY", "stooq")
