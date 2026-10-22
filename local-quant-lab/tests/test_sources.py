"""Data states and eligibility, the Massive end-of-day adapter, and the FRED/BEA/SEC context clients.

Network responses here are FIXTURES written in the shape of each provider's documented JSON (no network is used).
They prove the adapters' parsing, safety and labelling, not that a provider currently answers this way: that is
checked on the founder's machine (docs/audit/data-source-review.md)."""
import io
import json
import sys
import unittest
import urllib.error
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from lql import ROOT
from lql.data import calendar as cal
from lql.data import context as ctx
from lql.data.providers import MassiveProvider, ProviderError, SnapshotProvider, SyntheticProvider
from lql.data.quality import validate
from lql.data.schema import (DATA_STATES, USES, SYNTHETIC, PROVISIONAL, VERIFIED_HISTORICAL, REJECTED, LIVE_FEED,
                             IMPORTED_UNVERIFIED, dataset_state, eligible, eligibility, SourceInfo)
from tests.helpers import tmpdir

KEY = "zzMASSIVEkey123"
sys.path.insert(0, str(ROOT / "scripts"))


class Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def opener_for(bodies, seen):
    def op(req, timeout=None):
        seen.append(req)
        b = bodies.pop(0)
        if isinstance(b, Exception):
            raise b
        return Resp(json.dumps(b).encode() if not isinstance(b, bytes) else b)
    return op


NY = ZoneInfo("America/New_York")


def ny_session_ms(d):
    """Unix ms of 00:00 New York on date d: the documented start of a daily aggregate window."""
    return int(datetime(d.year, d.month, d.day, tzinfo=NY).timestamp() * 1000)


def massive_page(n=3, start_ms=1729569600000, adjusted=True, status="OK", next_url=None):
    # FIXTURE in the documented aggregates shape: t = Unix ms of the session window start (00:00 New York).
    # Dates are computed in an explicit timezone (never the machine's local zone) and only weekdays are emitted, as a
    # vendor sends them. This fixture window (October 2024) has no exchange holidays; the production calendar is not
    # consulted here so that the import test still exercises it independently.
    start = datetime.fromtimestamp(start_ms / 1000, tz=NY)
    assert (start.hour, start.minute, start.second) == (0, 0, 0), "start_ms must be 00:00 New York"
    d = start.date()
    days = []
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    assert all(date(2024, 10, 1) <= x <= date(2024, 10, 31) for x in days), "fixture window is October 2024 (no holidays)"
    ts = [ny_session_ms(x) for x in days]
    assert [datetime.fromtimestamp(t / 1000, tz=NY).date() for t in ts] == days
    res = [{"o": 100 + i, "h": 102 + i, "l": 99 + i, "c": 101 + i, "v": 1000 + i, "vw": 100.5 + i, "n": 10,
            "t": ts[i]} for i in range(n)]
    b = {"ticker": "SPY", "adjusted": adjusted, "status": status, "resultsCount": n, "results": res, "request_id": "x"}
    if next_url:
        b["next_url"] = next_url
    return b


class DataStateTests(unittest.TestCase):
    def test_eligibility_table(self):
        self.assertEqual(set(DATA_STATES), {SYNTHETIC, IMPORTED_UNVERIFIED, PROVISIONAL, VERIFIED_HISTORICAL,
                                            LIVE_FEED, REJECTED})
        for st in DATA_STATES:
            self.assertFalse(eligible(st, "real_orders"), st)                     # no live trading in any state
        for use in ("research_evidence", "candidate_verdict", "holdout", "forward_paper_evidence"):
            self.assertFalse(eligible(SYNTHETIC, use), use)
            self.assertFalse(eligible(PROVISIONAL, use), use)
            self.assertTrue(eligible(VERIFIED_HISTORICAL, use), use)
        self.assertTrue(eligible(SYNTHETIC, "software_tests"))
        for st in (REJECTED, IMPORTED_UNVERIFIED, LIVE_FEED):
            self.assertFalse(any(eligibility(st).values()), st)
        with self.assertRaises(ValueError):
            eligible(SYNTHETIC, "anything")
        self.assertEqual(list(eligibility(SYNTHETIC)), list(USES))

    def test_dataset_state_follows_validation_and_adjustment_evidence(self):
        p = SyntheticProvider()
        bars = p.bars("DEMO-ETF-A")
        self.assertEqual(dataset_state(p.info(), validate(bars)), SYNTHETIC)
        self.assertEqual(dataset_state(p.info(), validate(bars + bars[-1:])), REJECTED)        # duplicate bar
        real = SourceInfo("massive", "HISTORICAL_SNAPSHOT", "x", content_sha256="ab", adjusted="split_adjusted_only")
        self.assertEqual(dataset_state(real, validate(bars)), PROVISIONAL)
        claimed = SourceInfo("massive", "HISTORICAL_SNAPSHOT", "x", content_sha256="ab",
                             adjusted="split_and_dividend_adjusted")                          # a label is not evidence
        self.assertEqual(dataset_state(claimed, validate(bars)), PROVISIONAL)
        ok = SourceInfo("massive", "HISTORICAL_SNAPSHOT", "x", content_sha256="ab",
                        adjusted="split_and_dividend_adjusted", adjustment_evidence="checked vs reference 2026-10-22")
        self.assertEqual(dataset_state(ok, validate(bars)), VERIFIED_HISTORICAL)
        unhashed = SourceInfo("massive", "HISTORICAL_DOWNLOADED", "x")
        self.assertEqual(dataset_state(unhashed), IMPORTED_UNVERIFIED)


class CalendarTests(unittest.TestCase):
    def test_xnys_calendar_matches_published_session_counts_and_rules(self):
        self.assertEqual([len(cal.sessions(date(y, 1, 1), date(y, 12, 31))) for y in (2022, 2023, 2024)], [251, 250, 252])
        h24 = cal.holidays(2024)
        self.assertEqual(sorted(h24), [date(2024, 1, 1), date(2024, 1, 15), date(2024, 2, 19), date(2024, 3, 29),
                                       date(2024, 5, 27), date(2024, 6, 19), date(2024, 7, 4), date(2024, 9, 2),
                                       date(2024, 11, 28), date(2024, 12, 25)])
        self.assertIn(date(2022, 6, 20), cal.holidays(2022))             # Juneteenth on Sunday -> Monday
        self.assertNotIn(date(2021, 6, 18), cal.holidays(2021))          # Juneteenth not observed before 2022
        self.assertIn(date(2026, 7, 3), cal.holidays(2026))              # July 4 on Saturday -> Friday
        self.assertNotIn(date(2021, 12, 31), cal.holidays(2021))         # New Year on Saturday is not moved back
        self.assertIn(date(2025, 1, 9), cal.holidays(2025))              # special closure
        self.assertEqual(cal.easter(2026), date(2026, 4, 5))
        self.assertFalse(cal.is_session(date(2024, 11, 28)))
        self.assertTrue(cal.is_session(date(2024, 11, 29)))              # early close is still a session

    def test_validation_flags_missing_sessions_and_blocks_holiday_bars(self):
        from lql.data.schema import Bar
        mk = lambda d: Bar("SPY", d, 100, 101, 99, 100.5, 1000, "USD", "massive", "")  # noqa: E731
        days = [date(2024, 7, 1), date(2024, 7, 2), date(2024, 7, 3), date(2024, 7, 8)]  # 5 July missing
        q = validate([mk(d) for d in days], "SPY", calendar="XNYS")
        self.assertTrue(q.passes_validation)
        self.assertEqual([i["date"] for i in q.issues if i["code"] == "missing_session"], ["2024-07-05"])
        bad = validate([mk(d) for d in days[:3] + [date(2024, 7, 4), date(2024, 7, 5)]], "SPY", calendar="XNYS")
        self.assertFalse(bad.passes_validation)                          # a bar on Independence Day: timestamp error
        self.assertEqual([i["date"] for i in bad.issues if i["code"] == "non_session_bar"], ["2024-07-04"])
        self.assertTrue(validate(SyntheticProvider().bars("DEMO-ETF-A")).passes_validation)   # synthetic: no calendar
        with self.assertRaises(ValueError):
            validate([mk(days[0])], "SPY", calendar="XLON")


class MassiveTests(unittest.TestCase):
    def provider(self, bodies, seen, key=KEY):
        t = [0.0]
        sleeps = []
        p = MassiveProvider(opener=opener_for(bodies, seen), api_key=key, sleep=lambda s: (sleeps.append(s), t.__setitem__(0, t[0] + s)),
                            clock=lambda: t[0])
        return p, sleeps

    def test_parses_bars_in_new_york_dates_and_keeps_the_key_out_of_the_url(self):
        seen = []
        p, _ = self.provider([massive_page()], seen)
        bars, info, pages, req = p.fetch("SPY", "2024-10-22", "2024-10-25")
        self.assertEqual([b.event_date for b in bars], [date(2024, 10, 22), date(2024, 10, 23), date(2024, 10, 24)])
        self.assertEqual((bars[0].open, bars[0].close, bars[0].volume), (100.0, 101.0, 1000.0))
        self.assertEqual(info.adjusted, "split_adjusted_only")
        self.assertNotIn(KEY, seen[0].full_url)
        self.assertEqual(seen[0].get_header("Authorization"), f"Bearer {KEY}")
        self.assertIn("adjusted=true", seen[0].full_url)
        self.assertNotIn(KEY, json.dumps(req) + info.description + info.terms)
        self.assertEqual(len(pages), 1)
        self.assertEqual(dataset_state(info, validate(bars)), "IMPORTED_UNVERIFIED")   # not yet hashed into a snapshot

    def test_rate_limit_pagination_and_refusals(self):
        seen = []
        nxt = MassiveProvider.BASE + "/v2/aggs/next?cursor=abc"
        p, sleeps = self.provider([massive_page(2, next_url=nxt), massive_page(2, start_ms=1729569600000 + 5 * 86_400_000)], seen)
        bars, _, pages, _ = p.fetch("SPY", "2024-10-01", "2024-10-31")
        self.assertEqual((len(bars), len(pages)), (4, 2))
        self.assertEqual(len(sleeps), 1)
        self.assertGreaterEqual(sleeps[0], MassiveProvider.MIN_INTERVAL_S - 1e-9)       # 5 calls/minute respected
        err429 = urllib.error.HTTPError("u", 429, "Too Many", {}, None)
        for bodies, msg in (([err429], "429"), ([massive_page(adjusted=False)], "adjusted=true"),
                            ([massive_page(status="ERROR")], "status ERROR"), ([b"<html>"], "not JSON"),
                            ([massive_page(next_url="https://evil.example/x")], "another host"),
                            ([{"status": "OK", "adjusted": True, "results": []}], "no bars")):
            seen = []
            p, _ = self.provider(bodies, seen)
            with self.assertRaises(ProviderError) as cm:
                p.fetch("SPY", "2024-10-01", "2024-10-31")
            self.assertIn(msg, str(cm.exception))
            self.assertNotIn(KEY, str(cm.exception))
        p, _ = self.provider([], [], key="")
        with self.assertRaises(ProviderError) as cm:
            p.fetch("SPY", "2024-10-01", "2024-10-31")
        self.assertIn("MASSIVE_API_KEY", str(cm.exception))
        p, _ = self.provider([massive_page()], [])
        with self.assertRaises(ProviderError):                                           # never the current session
            p.fetch("SPY", "2024-10-01", date.today().isoformat())

    def test_import_script_writes_a_provisional_hashed_snapshot_with_raw_kept_apart(self):
        import import_massive as im
        d = tmpdir()
        seen = []
        p, _ = self.provider([massive_page(5)], seen)
        q, path, m = im.import_one(p, "SPY", "2024-10-22", "2024-10-29", d)
        self.assertTrue(q.passes_validation)
        self.assertEqual(m["data_state"], PROVISIONAL)
        self.assertEqual(m["adjusted"], "split_adjusted_only")
        self.assertEqual(len(m["raw_sha256"]), 1)
        self.assertTrue(any((Path(d) / "raw").glob("SPY-*.json")))
        self.assertNotIn(KEY, Path(path).with_suffix(".manifest.json").read_text())
        sp = SnapshotProvider(d)
        self.assertEqual(len(sp.bars("SPY")), 5)                     # the hash check passes on read
        self.assertEqual(dataset_state(sp.info("SPY"), validate(sp.bars("SPY"))), PROVISIONAL)
        self.assertEqual(im.main(["SPY", "--from", "2024-10-01", "--to", "2024-10-02", "--dir", str(d)]), 2)  # terms flag


class ContextTests(unittest.TestCase):
    def test_fred_vintages_give_point_in_time_values(self):
        seen = []
        body = {"units": "Percent", "observations": [
            {"date": "2026-08-01", "value": "4.2", "realtime_start": "2026-09-05", "realtime_end": "2026-10-02"},
            {"date": "2026-08-01", "value": "4.3", "realtime_start": "2026-10-03", "realtime_end": "9999-12-31"},
            {"date": "2026-09-01", "value": ".", "realtime_start": "2026-10-03", "realtime_end": "9999-12-31"}]}
        c = ctx.FredClient(opener=opener_for([body], seen), api_key="fredKEY999", sleep=lambda s: None)
        rows, meta, raw = c.observations("UNRATE", all_vintages=True)
        self.assertEqual(meta["notice"], ctx.FRED_NOTICE)
        self.assertEqual(ctx.as_of_values(rows, "2026-09-20"), {"2026-08-01": 4.2})        # Sept data not yet out
        self.assertEqual(ctx.as_of_values(rows, "2026-10-10"), {"2026-08-01": 4.3, "2026-09-01": None})
        with self.assertRaises(ctx.ContextError):
            ctx.as_of_values([{"date": "x", "value": 1, "realtime_start": None, "realtime_end": None}], "2026-01-01")
        bad = ctx.FredClient(opener=opener_for([urllib.error.URLError("x")], []), api_key="fredKEY999")
        with self.assertRaises(ctx.ContextError) as cm:
            bad.observations("UNRATE")
        self.assertNotIn("fredKEY999", str(cm.exception))
        with self.assertRaises(ctx.ContextError):
            ctx.FredClient(api_key="").observations("UNRATE")
        with self.assertRaises(ctx.ContextError):
            ctx.FredClient(api_key="k").observations("UNRATE&x=1")

    def test_bea_requires_a_36_character_userid_and_surfaces_errors(self):
        good = "A" * 8 + "-" + "B" * 4 + "-" + "C" * 4 + "-" + "D" * 4 + "-" + "E" * 12
        self.assertEqual(len(good), 36)
        c = ctx.BeaClient(opener=opener_for([{"BEAAPI": {"Results": {"Data": [{"TimePeriod": "2026Q2", "DataValue": "1.0"}]}}}], []),
                          api_key=good, sleep=lambda s: None)
        data, meta, _ = c.get_data("NIPA", TableName="T10101", Frequency="Q", Year="2026")
        self.assertEqual(data[0]["TimePeriod"], "2026Q2")
        with self.assertRaises(ctx.ContextError) as cm:
            ctx.BeaClient(api_key="short-key").get_data("NIPA")
        self.assertIn("36-character", str(cm.exception))
        self.assertNotIn("short-key", str(cm.exception))
        err = ctx.BeaClient(opener=opener_for([{"BEAAPI": {"Error": {"APIErrorDescription": "bad table"}}}], []),
                            api_key=good, sleep=lambda s: None)
        with self.assertRaises(ctx.ContextError):
            err.get_data("NIPA", TableName="nope")

    def test_sec_point_in_time_ignores_later_restatements(self):
        facts = {"entityName": "Example Corp", "facts": {"us-gaap": {"Revenues": {"units": {"USD": [
            {"end": "2025-12-31", "val": 100, "filed": "2026-02-10", "form": "10-K", "fy": 2025, "fp": "FY", "accn": "1"},
            {"end": "2025-12-31", "val": 90, "filed": "2026-08-01", "form": "10-K/A", "fy": 2025, "fp": "FY", "accn": "2"},
            {"end": "2026-03-31", "val": 30, "filed": "2026-05-05", "form": "10-Q", "fy": 2026, "fp": "Q1", "accn": "3"}]}}}}}
        seen = []
        c = ctx.SecClient(opener=opener_for([facts], seen), api_key="LocalQuantLab research me@example.com",
                          sleep=lambda s: None)
        body, meta, raw = c.company_facts(320193)
        self.assertTrue(seen[0].full_url.endswith("CIK0000320193.json"))
        self.assertEqual(seen[0].get_header("User-agent"), "LocalQuantLab research me@example.com")
        rows = ctx.facts_for(body, "Revenues")
        self.assertEqual(ctx.point_in_time(rows, "2026-03-01"), {"2025-12-31": 100})
        self.assertEqual(ctx.point_in_time(rows, "2026-09-01"), {"2025-12-31": 90, "2026-03-31": 30})
        with self.assertRaises(ctx.ContextError):
            ctx.SecClient(api_key="no contact").company_facts(1)
        with self.assertRaises(ctx.ContextError):
            ctx.facts_for(body, "NoSuchConcept")
        path, rec = ctx.save("sec", "CIK320193-Revenues", rows, meta, raw, directory=tmpdir())
        self.assertTrue(rec["not_price_data"])
        self.assertEqual(rec["data_state"], "CONTEXT")
        with self.assertRaises(ctx.ContextError):
            ctx.save("sec", "../escape", rows, meta, raw, directory=tmpdir())


if __name__ == "__main__":
    unittest.main()
