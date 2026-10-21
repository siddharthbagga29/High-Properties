import copy
import json
import unittest
from dataclasses import replace

from lql.data.providers import SyntheticProvider
from lql.research import stats
from lql.research.walkforward import (DEFAULT_SPEC, freeze, run_walk_forward, evaluate_holdout, ResearchError,
                                      HoldoutConsumed, load_registration)
from tests.helpers import settings, tmpdir

UNI = ("DEMO-ETF-A", "DEMO-ETF-B")


def small_spec(name="t"):
    s = copy.deepcopy(DEFAULT_SPEC)
    s["name"] = name
    s["candidates"] = [{"strategy": "sma_trend", "params": {"fast": 20, "slow": 100}},
                       {"strategy": "sma_trend", "params": {"fast": 50, "slow": 150}},
                       {"strategy": "vol_scaled_trend", "params": {"slow": 100, "vol_lookback": 20, "target_vol_pct": 10}},
                       {"strategy": "vol_scaled_trend", "params": {"slow": 150, "vol_lookback": 20, "target_vol_pct": 15}}]
    s["bootstrap"]["n_boot"] = 200
    return s


def lenient_spec(name):
    """Thresholds loosened BEFORE freezing, only so the post-walk-forward holdout path can be exercised."""
    s = small_spec(name)
    s["acceptance"].update({"min_oos_exits": 0, "min_oos_net_sharpe": -10.0})
    return s


def data(n=1500, seed=7):
    p = SyntheticProvider(seed=seed, n_days=n)
    return {i: p.bars(i) for i in UNI}, p.info()


class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.d, self.info = data()
        self.s, self.dir = settings(), tmpdir()

    def test_freeze_is_idempotent_and_hash_depends_on_everything(self):
        r1 = freeze(small_spec(), self.d, self.s, self.dir, self.info)
        r2 = freeze(small_spec(), self.d, self.s, self.dir, self.info)
        self.assertEqual(r1, r2)
        other = small_spec()
        other["windows"]["test_bars"] = 63
        self.assertNotEqual(freeze(other, self.d, self.s, self.dir, self.info)["spec_hash"], r1["spec_hash"])
        self.assertNotEqual(freeze(small_spec(), self.d, replace(self.s, initial_cash=50000.0), self.dir,
                                   self.info)["spec_hash"], r1["spec_hash"])
        self.assertTrue(r1["synthetic"])

    def test_run_refuses_changed_data_or_changed_spec(self):
        reg = freeze(small_spec(), self.d, self.s, self.dir, self.info)
        other, _ = data(seed=8)
        with self.assertRaises(ResearchError):
            run_walk_forward(reg, other, self.s, self.dir)
        tampered = copy.deepcopy(reg)
        tampered["spec"]["acceptance"]["min_oos_net_sharpe"] = -5.0     # loosening the bar after the fact
        with self.assertRaises(ResearchError):
            run_walk_forward(tampered, self.d, self.s, self.dir)
        with self.assertRaises(ResearchError):
            load_registration(self.dir, "0" * 16)


class WalkForwardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d, cls.info = data()
        cls.s, cls.dir = settings(), tmpdir()
        cls.reg = freeze(small_spec(), cls.d, cls.s, cls.dir, cls.info)
        cls.rep = run_walk_forward(cls.reg, cls.d, cls.s, cls.dir)

    def test_chronology_and_holdout_untouched(self):
        rep = self.rep
        self.assertGreaterEqual(rep["n_folds"], 3)
        prev_end = ""
        for f in rep["folds"]:
            self.assertLess(f["train"][1], f["test"][0])
            self.assertLess(prev_end, f["test"][0])           # test windows never overlap
            prev_end = f["test"][1]
        self.assertLessEqual(prev_end, self.reg["pre_holdout_last"])
        self.assertLess(self.reg["pre_holdout_last"], self.d[UNI[0]][-1].event_date.isoformat())
        self.assertEqual(rep["holdout"]["status"], "NOT_EVALUATED")

    def test_in_sample_and_out_of_sample_are_reported_separately(self):
        rep = self.rep
        self.assertIn("mean_selected_sharpe", rep["in_sample"])
        oos = rep["out_of_sample"]
        for key in ("metrics", "benchmark", "stress_2x_costs", "bootstrap", "selection_stability"):
            self.assertIn(key, oos)
        for key in ("sharpe", "max_drawdown", "avg_exposure", "turnover_annual", "costs", "exits", "n_fills"):
            self.assertIn(key, oos["metrics"])
        self.assertEqual(oos["days"], sum(1 for _ in range(len(rep["series"]["dates"]) - 1)))
        self.assertIn("multiple_testing_note", rep)

    def test_synthetic_data_can_never_pass_and_nothing_is_promoted(self):
        self.assertNotEqual(self.rep["verdict"], "CANDIDATE")
        self.assertEqual(self.rep["alpha_status"] in ("unproven", "rejected"), True)
        by = {c["name"]: c for c in self.rep["checks"]}
        self.assertFalse(by["not_synthetic"]["passed"])
        self.assertFalse(by["holdout_passed"]["passed"])

    def test_selection_uses_only_in_sample_information(self):
        """Wrecking every bar after a fold's train window must not change what that fold selected."""
        from dataclasses import replace as rep_
        from lql.research.walkforward import _folds
        f0 = self.rep["folds"][0]
        cut = f0["train"][1]
        wrecked = {i: [b if b.event_date.isoformat() <= cut else
                       rep_(b, open=b.open * 0.2, high=b.high * 0.2, low=b.low * 0.2, close=b.close * 0.2)
                       for b in bars] for i, bars in self.d.items()}
        reg2 = freeze(small_spec("wrecked"), wrecked, self.s, self.dir, self.info)
        rep2 = run_walk_forward(reg2, wrecked, self.s, self.dir)
        self.assertEqual(rep2["folds"][0]["selected"], f0["selected"])
        self.assertEqual(rep2["folds"][0]["in_sample"], f0["in_sample"])

    def test_holdout_data_cannot_influence_the_walk_forward(self):
        from dataclasses import replace as rep_
        last_pre = self.reg["pre_holdout_last"]
        wrecked = {i: [b if b.event_date.isoformat() <= last_pre else
                       rep_(b, open=b.open * 5, high=b.high * 5, low=b.low * 5, close=b.close * 5) for b in bars]
                   for i, bars in self.d.items()}
        reg2 = freeze(small_spec("holdout-wrecked"), wrecked, self.s, self.dir, self.info)
        rep2 = run_walk_forward(reg2, wrecked, self.s, self.dir)
        self.assertEqual(rep2["series"]["equity"], self.rep["series"]["equity"])

    def test_deterministic(self):
        again = run_walk_forward(self.reg, self.d, self.s, self.dir)
        for r in (again, self.rep):
            r.pop("created_at")
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(self.rep, sort_keys=True))

    def test_too_little_data_is_insufficient_not_a_result(self):
        d, info = data(n=700)
        reg = freeze(small_spec("short"), d, self.s, self.dir, info)
        rep = run_walk_forward(reg, d, self.s, self.dir)
        self.assertEqual(rep["verdict"], "INSUFFICIENT")
        self.assertNotIn("out_of_sample", rep)


class HoldoutTests(unittest.TestCase):
    def test_holdout_is_spent_once_and_later_studies_are_flagged(self):
        d, info = data(seed=1)   # seed found by scanning seeds 1-11: the only purpose is a series where the lenient spec reaches NOT_PROVEN, so the holdout code path runs
        s, directory = settings(), tmpdir()
        reg = freeze(lenient_spec("h1"), d, s, directory, info)
        with self.assertRaises(ResearchError):
            evaluate_holdout(reg, d, s, directory)                 # not before the walk-forward
        rep = run_walk_forward(reg, d, s, directory)
        self.assertEqual(rep["verdict"], "NOT_PROVEN")
        out = evaluate_holdout(reg, d, s, directory)
        self.assertEqual(out["holdout"]["status"], "EVALUATED")
        self.assertNotEqual(out["verdict"], "CANDIDATE")            # synthetic
        with self.assertRaises(HoldoutConsumed):
            evaluate_holdout(reg, d, s, directory)
        reg2 = freeze(lenient_spec("h2-same-data"), d, s, directory, info)
        rep2 = run_walk_forward(reg2, d, s, directory)
        by = {c["name"]: c for c in rep2["checks"]}
        self.assertFalse(by["holdout_uncontaminated"]["passed"])
        self.assertEqual(rep2["holdout_contaminated_by"], reg["spec_hash"])

    def test_losing_out_of_sample_is_rejected_when_sample_size_is_not_the_issue(self):
        d, info = data()
        s, directory = settings(), tmpdir()
        spec = small_spec("loser")
        spec["acceptance"]["min_oos_exits"] = 0
        rep = run_walk_forward(freeze(spec, d, s, directory, info), d, s, directory)
        self.assertEqual(rep["verdict"], "REJECTED")
        self.assertEqual(rep["alpha_status"], "rejected")

    def test_failed_studies_do_not_burn_the_holdout(self):
        d, info = data(n=700)
        s, directory = settings(), tmpdir()
        reg = freeze(small_spec("short2"), d, s, directory, info)
        run_walk_forward(reg, d, s, directory)
        with self.assertRaises(ResearchError):
            evaluate_holdout(reg, d, s, directory)


class StatsTests(unittest.TestCase):
    def test_bootstrap_is_deterministic_and_brackets_the_estimate(self):
        import random
        r = random.Random(3)
        a = [r.gauss(0.0006, 0.01) for _ in range(600)]
        b = [r.gauss(0.0002, 0.01) for _ in range(600)]
        x = stats.block_bootstrap(a, b, n_boot=300)
        self.assertEqual(x, stats.block_bootstrap(a, b, n_boot=300))
        lo, hi = x["sharpe_ci"]
        self.assertLess(lo, stats.sharpe(a))
        self.assertGreater(hi, stats.sharpe(a))
        self.assertIsNone(stats.block_bootstrap(a[:5]))
        self.assertLess(stats.max_drawdown([1, 2, 1, 3]), 0)


if __name__ == "__main__":
    unittest.main()


class CliTests(unittest.TestCase):
    def test_research_command_freezes_runs_and_logs(self):
        import argparse
        from lql.cli import _research
        from lql.lab import Lab
        lab = Lab(state_dir=tmpdir())
        a = argparse.Namespace(action="run", source="synthetic", instruments="DEMO-ETF-A,DEMO-ETF-B", days=1500,
                               name="cli-test", spec=None, start="2019-02-01")
        out = _research(lab, a)
        self.assertIn(out["verdict"], ("NOT_PROVEN", "REJECTED", "INSUFFICIENT"))
        self.assertTrue((lab.state / "research" / "prereg" / f"{out['spec_hash']}.json").exists())
        rows = (lab.state / "research" / "runs.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(rows[-1])["spec_hash"], out["spec_hash"])
        kinds = [e["kind"] for e in lab.events.read()]
        self.assertIn("research_frozen", kinds)
        self.assertIn("research_walkforward", kinds)
        shown = _research(lab, argparse.Namespace(**{**vars(a), "action": "show", "spec": out["spec_hash"]}))
        self.assertEqual(shown["spec_hash"], out["spec_hash"])
