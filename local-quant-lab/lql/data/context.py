"""Context data: macro series (FRED, BEA) and company filings facts (SEC EDGAR). These are NOT price bars: nothing here
can feed a backtest's fills or a strategy's prices, and nothing here makes a dataset VERIFIED_HISTORICAL.

Every client is optional and runs only on the founder's machine (the build environment cannot reach these hosts):
- FRED: key from FRED_API_KEY. FRED's terms require the notice in FRED_NOTICE wherever results are shown, and some
  series are owned by third parties with their own restrictions. Point-in-time use goes through ALFRED vintages
  (realtime_start / realtime_end): `as_of_values` returns only what was published by the decision date.
- BEA: key (a registered 36-character UserID) from BEA_API_USERID. Economic statistics only, never equity prices.
- SEC EDGAR (data.sec.gov): no key; a descriptive User-Agent with a contact address is required (SEC_USER_AGENT) and
  requests are spaced well under the published 10 requests/second. `point_in_time` keeps only facts filed by the
  decision date, so later restatements never leak backwards.

Safety rules shared with the price providers: keys come from the environment only and are never logged, stored or
put in an error message (FRED and BEA put the key in the query string, so a failed request is reported by type only);
HTTP 429 stops the call with no retry; responses are saved with their SHA-256 under data/context/ (git-ignored).
"""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from .. import ROOT
from ..events import atomic_write_json, now_iso

CONTEXT_DIR = ROOT / "data" / "context"
FRED_NOTICE = "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis."


class ContextError(Exception):
    pass


class _Client:
    KEY_ENV = ""
    MIN_INTERVAL_S = 1.0
    NAME = ""

    def __init__(self, opener=None, api_key=None, timeout=30, sleep=None, clock=None):
        self.opener = opener or urllib.request.urlopen
        self.api_key = api_key if api_key is not None else (os.environ.get(self.KEY_ENV, "") if self.KEY_ENV else "")
        self.timeout = timeout
        self.sleep, self.clock = sleep or time.sleep, clock or time.monotonic
        self._last = None

    def _get(self, url, headers=None):
        if self._last is not None:
            wait = self.MIN_INTERVAL_S - (self.clock() - self._last)
            if wait > 0:
                self.sleep(wait)
        self._last = self.clock()
        try:
            with self.opener(urllib.request.Request(url, headers=headers or {}), timeout=self.timeout) as r:
                raw = r.read()
        except urllib.error.HTTPError as e:
            e.close()      # the error carries the server's response: release the connection now
            if e.code == 429:
                raise ContextError(f"{self.NAME} rate limit reached (HTTP 429): stop and wait; no retry")
            raise ContextError(f"{self.NAME} request failed: HTTP {e.code}")
        except Exception as e:      # never echo the URL: FRED and BEA carry the key in the query string
            raise ContextError(f"{self.NAME} request failed: {type(e).__name__}")
        try:
            return raw, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ContextError(f"{self.NAME} returned something that is not JSON")


class FredClient(_Client):
    NAME, KEY_ENV, MIN_INTERVAL_S = "FRED", "FRED_API_KEY", 0.6
    BASE = "https://api.stlouisfed.org/fred/series/observations"

    def observations(self, series_id, start=None, end=None, vintage=None, all_vintages=False):
        if not re.fullmatch(r"[A-Za-z0-9_.]{1,40}", series_id):
            raise ContextError("bad FRED series id")
        if not self.api_key:
            raise ContextError(f"no FRED key: set {self.KEY_ENV} in your shell")
        q = {"series_id": series_id, "api_key": self.api_key, "file_type": "json"}
        if start:
            q["observation_start"] = start
        if end:
            q["observation_end"] = end
        if all_vintages:      # every vintage: needed to answer "what was known on date d" for any d
            q.update(realtime_start="1776-07-04", realtime_end="9999-12-31")
        elif vintage:
            q.update(realtime_start=vintage, realtime_end=vintage)
        raw, body = self._get(f"{self.BASE}?{urllib.parse.urlencode(q)}")
        if "error_message" in body:
            raise ContextError(f"FRED error: {str(body['error_message'])[:160]}")
        rows = []
        for o in body.get("observations", []):
            v = o.get("value")
            rows.append({"date": o["date"], "value": None if v in (".", "", None) else float(v),
                         "realtime_start": o.get("realtime_start"), "realtime_end": o.get("realtime_end")})
        meta = {"provider": "FRED", "series_id": series_id, "notice": FRED_NOTICE, "vintage": vintage,
                "all_vintages": all_vintages, "units": body.get("units"),
                "terms": "FRED API terms: show FRED_NOTICE; third-party series may carry their own restrictions"}
        return rows, meta, raw


def as_of_values(rows, decision_date):
    """From ALFRED-style rows (all vintages), the value of each observation date as it was published on
    `decision_date`. Observations not yet published by then are absent, so they cannot leak into a decision."""
    d = date.fromisoformat(decision_date)
    out = {}
    for r in rows:
        if r["realtime_start"] is None:
            raise ContextError("rows carry no vintage dates: request all_vintages=True for point-in-time use")
        if date.fromisoformat(r["realtime_start"]) <= d <= date.fromisoformat(r["realtime_end"]):
            out[r["date"]] = r["value"]
    return dict(sorted(out.items()))


class BeaClient(_Client):
    NAME, KEY_ENV, MIN_INTERVAL_S = "BEA", "BEA_API_USERID", 1.0
    BASE = "https://apps.bea.gov/api/data"

    def key_looks_valid(self):
        """BEA issues a 36-character UserID. Checks shape only; never prints the key."""
        return bool(re.fullmatch(r"[A-Za-z0-9-]{36}", self.api_key or ""))

    def get_data(self, dataset, **params):
        if not self.api_key:
            raise ContextError(f"no BEA UserID: set {self.KEY_ENV} in your shell")
        if not self.key_looks_valid():
            raise ContextError(f"{self.KEY_ENV} is set but is not a 36-character BEA UserID; is it a key for "
                               "another provider?")
        if not re.fullmatch(r"[A-Za-z0-9]{1,40}", dataset):
            raise ContextError("bad BEA dataset name")
        q = {"UserID": self.api_key, "method": "GetData", "DataSetName": dataset, "ResultFormat": "JSON", **params}
        raw, body = self._get(f"{self.BASE}?{urllib.parse.urlencode(q)}")
        api = body.get("BEAAPI", {})
        err = api.get("Error") or (api.get("Results") or {}).get("Error")
        if err:
            raise ContextError(f"BEA error: {str(err.get('APIErrorDescription', err) if isinstance(err, dict) else err)[:160]}")
        data = (api.get("Results") or {}).get("Data") or []
        meta = {"provider": "BEA", "dataset": dataset, "params": params,
                "terms": "BEA API: registered UserID; statistics are revised: record the retrieval date"}
        return data, meta, raw


class SecClient(_Client):
    NAME, KEY_ENV, MIN_INTERVAL_S = "SEC EDGAR", "SEC_USER_AGENT", 0.15
    BASE = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

    def company_facts(self, cik):
        ua = self.api_key
        if not ua or "@" not in ua:
            raise ContextError("set SEC_USER_AGENT to a description with a contact e-mail, e.g. "
                               "'LocalQuantLab research you@example.com' (SEC fair-access policy)")
        raw, body = self._get(self.BASE.format(cik=int(cik)), headers={"User-Agent": ua, "Accept-Encoding": "identity"})
        meta = {"provider": "SEC EDGAR", "cik": int(cik), "entity": body.get("entityName"),
                "terms": "data.sec.gov: no key; declared User-Agent; under 10 requests/second"}
        return body, meta, raw


def facts_for(company_facts, concept, taxonomy="us-gaap", unit="USD"):
    try:
        units = company_facts["facts"][taxonomy][concept]["units"][unit]
    except KeyError:
        raise ContextError(f"{taxonomy}:{concept} in {unit} not in these company facts")
    return [{"end": f["end"], "val": f["val"], "filed": f["filed"], "form": f.get("form"), "fp": f.get("fp"),
             "fy": f.get("fy"), "accn": f.get("accn")} for f in units]


def point_in_time(facts, as_of):
    """For each period end, the latest value FILED on or before `as_of` (restatements filed later are invisible)."""
    d = date.fromisoformat(as_of)
    best = {}
    for f in facts:
        if date.fromisoformat(f["filed"]) > d:
            continue
        cur = best.get(f["end"])
        if cur is None or f["filed"] > cur["filed"]:
            best[f["end"]] = f
    return dict(sorted((k, v["val"]) for k, v in best.items()))


def save(kind, name, payload, meta, raw, directory=CONTEXT_DIR):
    """Save a context dataset and its raw response with hashes (git-ignored)."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", name) or kind not in ("fred", "bea", "sec"):
        raise ContextError("bad context dataset name")
    d = Path(directory) / kind
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.raw.json").write_bytes(raw)
    rec = {"name": name, "kind": kind, "retrieved_at": now_iso(), "raw_sha256": hashlib.sha256(raw).hexdigest(),
           "data_state": "CONTEXT", "not_price_data": True, "meta": meta, "payload": payload}
    atomic_write_json(d / f"{name}.json", rec)
    return d / f"{name}.json", rec
