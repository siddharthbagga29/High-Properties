"""Pre-real-data audit: vendor access handling, adjustment status, provisional labelling, repository hygiene."""
import io
import json
import shutil
import subprocess
import unittest
from datetime import date, timedelta
from dataclasses import replace
from pathlib import Path

from lql import ROOT
from lql.data.adjustment import classify, attest, parse_ref
from lql.data.providers import (StooqProvider, ProviderError, SnapshotProvider, write_snapshot, combine_info,
                                SyntheticProvider)
from lql.data.quality import validate
from lql.data.schema import SourceInfo, ADJ_VERIFIED, Bar
from lql.execution.forward import ForwardRunner
from lql.export import find_secret
from lql.orchestrator.critic import review
from lql.research import walkforward as wf
from tests.helpers import settings, tmpdir, bars
from tests.test_walkforward import small_spec, lenient_spec, data as wf_data

A, B = "DEMO-ETF-A", "DEMO-ETF-B"
HTML_KEY_PAGE = "<html><body>To download data you need an apikey. Request API key here.</body></html>"
CSV = "Date,Open,High,Low,Close,Volume\n2024-01-02,100,101,99,100.5,1000\n2024-01-03,100.5,102,100,101,1200\n"


class FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener_for(text, seen=None):
    def op(url, timeout=0):
        if seen is not None:
            seen.append(url)
        return FakeResp(text.encode())
    return op


def real(adjusted="unknown", evidence=""):
    return SourceInfo(provider="fixture", kind="HISTORICAL_SNAPSHOT", description="fixture, not market data",
                      adjusted=adjusted, adjustment_evidence=evidence)


class StooqAccessTests(unittest.TestCase):
    def test_key_page_is_reported_not_parsed_and_nothing_is_bypassed(self):
        seen = []
        with self.assertRaises(ProviderError) as cm:
            StooqProvider(opener=opener_for(HTML_KEY_PAGE, seen), api_key="").fetch("SPY")
        self.assertIn("API key", str(cm.exception))
        self.assertEqual(len(seen), 1)                       # no retry, no second URL
        self.assertNotIn("apikey=", seen[0])                 # no key was invented or sent

    def test_key_goes_in_the_request_but_never_into_errors_manifests_or_logs(self):
        secret = "ZZtopSecret987"
        seen = []
        with self.assertRaises(ProviderError) as cm:
            StooqProvider(opener=opener_for(HTML_KEY_PAGE, seen), api_key=secret).fetch("SPY")
        self.assertIn(secret, seen[0])
        self.assertNotIn(secret, str(cm.exception))

        def boom(url, timeout=0):
            raise OSError(f"cannot reach {url}")
        with self.assertRaises(ProviderError) as cm2:
            StooqProvider(opener=boom, api_key=secret).fetch("SPY")
        self.assertNotIn(secret, str(cm2.exception))
        bars_, info = StooqProvider(opener=opener_for(CSV), api_key=secret).fetch("SPY")
        d = tmpdir()
        path, manifest = write_snapshot("SPY", bars_, info, d)
        for p in d.iterdir():
            self.assertNotIn(secret, p.read_text())

    def test_quota_message_is_distinct_and_single_shot(self):
        seen = []
        with self.assertRaises(ProviderError) as cm:
            StooqProvider(opener=opener_for("Exceeded the daily hits limit", seen), api_key="k" * 8).fetch("SPY")
        self.assertIn("limit", str(cm.exception))
        self.assertEqual(len(seen), 1)

    def test_downloaded_prices_are_provisional(self):
        bars_, info = StooqProvider(opener=opener_for(CSV), api_key="").fetch("SPY")
        self.assertEqual(info.adjusted, "unknown")
        self.assertTrue(info.is_provisional)
        self.assertEqual(len(bars_), 2)

    def test_script_refuses_without_the_terms_flag(self):
        r = subprocess.run(["python3", str(ROOT / "scripts" / "snapshot_stooq.py"), "SPY"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn("terms", r.stdout)

    def test_daily_script_needs_explicit_consent(self):
        r = subprocess.run(["sh", str(ROOT / "scripts" / "forward_daily.sh")], capture_output=True, text=True,
                           env={"PATH": "/usr/bin:/bin"})
        self.assertEqual(r.returncode, 2)

    def test_import_csv_never_sets_verified(self):
        d = tmpdir()
        f = d / "spy.csv"
        f.write_text(CSV)
        r = subprocess.run(["python3", str(ROOT / "scripts" / "import_csv.py"), "SPY", str(f), "--source", "manual test",
                            "--dir", str(d / "snap")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(SnapshotProvider(d / "snap").info("SPY").adjusted, "unknown")
        r2 = subprocess.run(["python3", str(ROOT / "scripts" / "import_csv.py"), "SPY", str(f), "--source", "x",
                             "--adjusted", ADJ_VERIFIED, "--dir", str(d / "snap")], capture_output=True, text=True)
        self.assertNotEqual(r2.returncode, 0)


class ProvisionalLabelTests(unittest.TestCase):
    def test_provisional_logic(self):
        self.assertFalse(SyntheticProvider().info().is_provisional)
        self.assertTrue(real().is_provisional)
        self.assertTrue(real(ADJ_VERIFIED, "").is_provisional)                    # claim without evidence
        self.assertTrue(real("split_adjusted_only", "ref").is_provisional)
        self.assertFalse(real(ADJ_VERIFIED, "matched two independent dates").is_provisional)
        mixed = combine_info([real(ADJ_VERIFIED, "e1"), real("unknown")])
        self.assertTrue(mixed.is_provisional)
        both = combine_info([real(ADJ_VERIFIED, "e1"), real(ADJ_VERIFIED, "e2")])
        self.assertFalse(both.is_provisional)

    def test_critic_never_gives_candidate_on_unverified_real_data(self):
        report = {"source": {"kind": "HISTORICAL_SNAPSHOT", "adjusted": "unknown", "adjustment_evidence": ""},
                  "series": {"dates": [], "equity": []}, "net": {"round_trips": 99}, "fills": [], "warnings": [],
                  "splits": {"net": {"test": {"total_return": 0.1, "sharpe": 1, "n_fills": 3}},
                             "benchmark": {"test": {"sharpe": 0.1}}}}
        out = review(report)
        self.assertNotEqual(out["verdict"], "CANDIDATE")
        self.assertTrue(any("PROVISIONAL" in f for f in out["findings"]))

    def test_split_like_jump_is_flagged(self):
        b = bars([100, 101, 102, 51, 52, 53])          # an unadjusted 2-for-1
        codes = [i["code"] for i in validate(b).issues]
        self.assertIn("split_suspect", codes)
        self.assertNotIn("split_suspect", [i["code"] for i in validate(bars([100, 120, 121])).issues])

    def test_forward_log_on_provisional_data_is_never_evidence(self):
        d = {i: SyntheticProvider(n_days=300).bars(i) for i in (A, B)}
        r = ForwardRunner(settings(), tmpdir(), (A, B), "sma_trend", {"fast": 20, "slow": 60}, "REPLAY")
        r.run_once(lambda: (d, real()))
        rep = r.report()
        self.assertTrue(rep["provisional"])
        self.assertFalse(rep["paper_evidence"]["mechanical_criteria_met"])
        self.assertTrue([x for x in r.log.read(("data_event",)) if x["code"] == "provisional_adjustment"])


class AdjustmentVerificationTests(unittest.TestCase):
    def series(self):
        # dividend-adjusted style: older closes are lower than the raw quotes of the day
        start = date(2008, 3, 14)
        out = []
        for i in range(400):
            c = 100.0 + i * 0.1
            out.append(Bar("SPY", start + timedelta(days=i), c, c * 1.01, c * 0.99, c, 1e6, "USD", "t"))
        return out

    def test_classification(self):
        b = self.series()
        d1, d2 = b[0].event_date, b[200].event_date
        adj = (d1, 130.0, b[0].close), (d2, 150.0, b[200].close)             # series matches the adjusted reference
        self.assertEqual(classify(b, list(adj))[0], ADJ_VERIFIED)
        raw = [(d1, b[0].close, 80.0), (d2, b[200].close, 90.0)]             # series matches the raw reference
        self.assertEqual(classify(b, raw)[0], "unadjusted")
        self.assertEqual(classify(b, [adj[0]])[0], "unknown")                # one decisive date is not enough
        same = [(d1, b[0].close, b[0].close * 1.001), (d2, b[200].close, b[200].close * 1.001)]
        self.assertEqual(classify(b, same)[0], "unknown")                    # raw ~ adjusted: cannot tell
        neither = [(d1, 130.0, 140.0), (d2, 150.0, 160.0)]
        self.assertEqual(classify(b, neither)[0], "unknown")
        self.assertEqual(classify(b, [(date(1990, 1, 1), 1.0, 2.0)] * 2)[0], "unknown")

    def test_attestation_only_clears_the_label_when_verified(self):
        d = tmpdir()
        b = self.series()
        write_snapshot("SPY", b, SourceInfo("manual_csv", "HISTORICAL_DOWNLOADED", "t", adjusted="unknown"), d)
        self.assertTrue(SnapshotProvider(d).info("SPY").is_provisional)
        attest(d, "SPY", "unknown", "inconclusive")
        self.assertTrue(SnapshotProvider(d).info("SPY").is_provisional)
        attest(d, "SPY", ADJ_VERIFIED, "matched independent adjusted closes at 2 dates")
        self.assertFalse(SnapshotProvider(d).info("SPY").is_provisional)
        SnapshotProvider(d).bars("SPY")                                       # the CSV hash still verifies
        self.assertEqual(parse_ref("2008-03-14:130.5:100.2"), (date(2008, 3, 14), 130.5, 100.2))
        with self.assertRaises(ValueError):
            parse_ref("2008-03-14")

    def test_verifying_the_data_reruns_cached_experiments_instead_of_reusing_provisional_ones(self):
        from lql.lab import Lab
        d = tmpdir()
        write_snapshot("SPY", self.series(), SourceInfo("massive", "HISTORICAL_DOWNLOADED", "t",
                                                        adjusted="dividend_adjusted_unverified"), d)
        lab = Lab(state_dir=tmpdir(), snapshot_dir=d)
        first = lab.experiment("SPY", "sma_trend", {"fast": 20, "slow": 60}, "snapshot")
        self.assertEqual(first["dataset"]["data_state"], "PROVISIONAL")
        attest(d, "SPY", ADJ_VERIFIED, "matched independent adjusted closes at 2 dates")
        again = lab.experiment("SPY", "sma_trend", {"fast": 20, "slow": 60}, "snapshot")
        self.assertFalse(again["cached"])                                    # same prices, new evidence status
        self.assertEqual(again["dataset"]["data_state"], "VERIFIED_HISTORICAL")
        self.assertTrue(lab.experiment("SPY", "sma_trend", {"fast": 20, "slow": 60}, "snapshot")["cached"])
        self.assertEqual(lab.experiment("DEMO-ETF-A", "sma_trend")["id"], "78bf2b7c3a7fbb8f")   # synthetic ids unchanged


class ResearchProvisionalTests(unittest.TestCase):
    def test_provisional_study_is_labelled_cannot_be_a_candidate_and_cannot_spend_the_holdout(self):
        d, _ = wf_data(seed=1)
        s, directory = settings(), tmpdir()
        reg = wf.freeze(lenient_spec("prov"), d, s, directory, real("unknown"))
        self.assertTrue(reg["provisional"])
        rep = wf.run_walk_forward(reg, d, s, directory)
        self.assertTrue(rep["provisional"])
        self.assertIn("PROVISIONAL", rep["evidence_label"])
        by = {c["name"]: c for c in rep["checks"]}
        self.assertFalse(by["price_adjustment_verified"]["passed"])
        self.assertNotEqual(rep["verdict"], "CANDIDATE")
        with self.assertRaises(wf.ResearchError) as cm:
            wf.evaluate_holdout(reg, d, s, directory)
        self.assertIn("PROVISIONAL", str(cm.exception))
        self.assertFalse((directory / "holdout_registry.json").exists())      # nothing was spent

    def test_verified_attestation_is_a_different_study_and_unlocks_the_holdout(self):
        d, _ = wf_data(seed=1)
        s, directory = settings(), tmpdir()
        prov = wf.freeze(lenient_spec("v"), d, s, directory, real("unknown"))
        ok = wf.freeze(lenient_spec("v"), d, s, directory, real(ADJ_VERIFIED, "matched independent closes"))
        self.assertNotEqual(prov["spec_hash"], ok["spec_hash"])
        self.assertFalse(ok["provisional"])
        rep = wf.run_walk_forward(ok, d, s, directory)
        by = {c["name"]: c for c in rep["checks"]}
        self.assertTrue(by["price_adjustment_verified"]["passed"])
        self.assertEqual(rep["verdict"], "NOT_PROVEN")
        out = wf.evaluate_holdout(ok, d, s, directory)
        self.assertEqual(out["holdout"]["status"], "EVALUATED")

    def test_the_committed_synthetic_registration_is_unchanged_and_still_verifies(self):
        """The audit must not alter the frozen protocol: the registration committed before it still verifies."""
        path = ROOT / "state" / "research" / "prereg" / "fcc75a7c47052167.json"
        reg = json.loads(path.read_text())
        p = SyntheticProvider(n_days=1800)
        data = {i: p.bars(i) for i in ("DEMO-ETF-A", "DEMO-ETF-B")}
        wf._verify(reg, data, settings())          # raises if the hash formula or the data changed
        self.assertEqual(reg["spec"]["acceptance"]["min_oos_exits"], 10)
        self.assertEqual(len(reg["spec"]["candidates"]), 12)
        self.assertFalse((ROOT / "state" / "research" / "holdout_registry.json").exists())


class RepositoryHygieneTests(unittest.TestCase):
    def test_sensitive_paths_are_git_ignored(self):
        if not shutil.which("git") or subprocess.run(["git", "rev-parse"], cwd=ROOT, capture_output=True).returncode:
            self.skipTest("not a git checkout")
        paths = ["data/snapshots/SPY.csv", "data/snapshots/SPY.manifest.json", "data/snapshots/archive/20261022/SPY.csv",
                 "state/forward/snapshot-forward/forward_log.jsonl", "state/forward/snapshot-forward/ledger.db",
                 "state/hermes_check.json", "state/research/results/abc.json", "state/events.jsonl",
                 "state/experiments/x.json", "state/paper.db", ".env", "exports/context.zip"]
        for p in paths:
            r = subprocess.run(["git", "check-ignore", "-q", p], cwd=ROOT)
            self.assertEqual(r.returncode, 0, f"{p} is not ignored")
        for p in ("state/research/prereg/x.json", "state/research/holdout_registry.json", ".env.example",
                  "docs/BUILD_STATE.md", "data/snapshots/.gitkeep"):
            self.assertNotEqual(subprocess.run(["git", "check-ignore", "-q", p], cwd=ROOT).returncode, 0, p)

    def test_staging_check_flags_what_must_not_be_committed(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("check_staging", ROOT / "scripts" / "check_staging.py")
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        bad = ["local-quant-lab/data/snapshots/SPY.csv", "state/forward/a/forward_log.jsonl", "state/hermes_check.json",
               ".env", "local-quant-lab/data/snapshots/SPY.manifest.json", "x/paper.db", "exports/c.zip"]
        self.assertEqual(sorted(m.violations(bad)), sorted(bad))
        ok = [".env.example", "docs/MAC_NEXT_STEPS.md", "state/research/prereg/a.json", "lql/cli.py"]
        self.assertEqual(m.violations(ok), [])

    def test_key_assignments_are_recognised_as_secrets(self):
        self.assertTrue(find_secret(b"export STOOQ_API_KEY=abc123def456"))
        self.assertTrue(find_secret(b"https://stooq.com/q/d/l/?s=spy.us&i=d&apikey=ABCD1234"))
        self.assertFalse(find_secret(b"STOOQ_API_KEY="))
        self.assertFalse(find_secret(b"STOOQ_API_KEY=<your key>"))


if __name__ == "__main__":
    unittest.main()
