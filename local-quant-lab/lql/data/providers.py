"""Market-data providers behind one interface. Vendor code stays here; strategies only see Bar objects.

- SyntheticProvider: deterministic seeded random walk on business days. Always labelled DEMO_SYNTHETIC.
- SnapshotProvider: reads a local CSV snapshot and its manifest (source, retrieval time, SHA-256).
- StooqProvider: optional end-of-day CSV download (key from STOOQ_API_KEY). Research-only, not a live feed.
- MassiveProvider: optional end-of-day aggregates from Massive (formerly Polygon.io), key from MASSIVE_API_KEY.
  Research-only, end-of-day, not live. Downloads are written as snapshots so every run is reproducible offline.
"""
import csv
import hashlib
import io
import json
import math
import random
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

from .. import ROOT
from ..events import now_iso
from .schema import Bar, SourceInfo

SNAPSHOT_DIR = ROOT / "data" / "snapshots"


class ProviderError(Exception):
    pass


def business_days(start, n):
    d, out = start, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


class SyntheticProvider:
    """Geometric random walk with regime-switching drift so trend rules have something to find (or fail on).
    Deterministic for a given (instrument, seed)."""
    name = "synthetic"

    def __init__(self, seed=7, n_days=1260, start=date(2019, 1, 2)):
        self.seed, self.n_days, self.start = seed, n_days, start

    def info(self):
        return SourceInfo(provider="synthetic", kind="DEMO_SYNTHETIC",
                          description=f"Deterministic synthetic daily bars (seed {self.seed}); not market data",
                          adjusted="n/a", terms="Generated locally; no third-party data")

    def bars(self, instrument):
        seed_val = int(hashlib.sha256(f"{instrument}:{self.seed}".encode()).hexdigest()[:12], 16)
        rng = random.Random(seed_val)
        price, out = 100.0 + rng.uniform(-20, 20), []
        drift = 0.0003
        for i, d in enumerate(business_days(self.start, self.n_days)):
            if i % 126 == 0:
                drift = rng.choice([-0.0006, 0.0002, 0.0008])
            ret = drift + rng.gauss(0, 0.011)
            o = price * (1 + rng.gauss(0, 0.002))
            c = price * math.exp(ret)
            hi = max(o, c) * (1 + abs(rng.gauss(0, 0.004)))
            lo = min(o, c) * (1 - abs(rng.gauss(0, 0.004)))
            out.append(Bar(instrument, d, round(o, 4), round(hi, 4), round(lo, 4), round(c, 4),
                           float(int(rng.uniform(5e5, 3e6))), "USD", "synthetic", ""))
            price = c
        return out


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_snapshot(instrument, bars, info, directory=SNAPSHOT_DIR, extra=None):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{instrument}.csv"
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "open", "high", "low", "close", "volume"])
        for b in bars:
            w.writerow([b.event_date.isoformat(), b.open, b.high, b.low, b.close, b.volume])
    manifest = {"instrument": instrument, "provider": info.provider, "kind": info.kind,
                "description": info.description, "retrieved_at": info.retrieved_at or now_iso(),
                "sha256": _sha256(path), "rows": len(bars),
                "first": bars[0].event_date.isoformat() if bars else None,
                "last": bars[-1].event_date.isoformat() if bars else None,
                "adjusted": info.adjusted, "adjustment_evidence": info.adjustment_evidence, "terms": info.terms}
    manifest.update({k: v for k, v in (extra or {}).items() if k not in manifest})
    (directory / f"{instrument}.manifest.json").write_text(json.dumps(manifest, indent=2))
    return path, manifest


def combine_info(infos):
    """One SourceInfo for a multi-instrument study: verified only if EVERY instrument is verified."""
    infos = list(infos)
    if len(infos) == 1:
        return infos[0]
    if all(i.adjustment_verified for i in infos):
        return replace(infos[0], adjustment_evidence=" | ".join(i.adjustment_evidence for i in infos),
                       content_sha256=hashlib.sha256("".join(i.content_sha256 for i in infos).encode()).hexdigest())
    weakest = next(i for i in infos if not i.adjustment_verified)
    return replace(infos[0], adjusted=weakest.adjusted, adjustment_evidence="",
                   content_sha256=hashlib.sha256("".join(i.content_sha256 for i in infos).encode()).hexdigest())


class SnapshotProvider:
    name = "csv_snapshot"

    def __init__(self, directory=SNAPSHOT_DIR):
        self.directory = Path(directory)

    def manifest(self, instrument):
        p = self.directory / f"{instrument}.manifest.json"
        if not p.exists():
            raise ProviderError(f"no snapshot manifest for {instrument} in {self.directory}")
        return json.loads(p.read_text())

    def info(self, instrument):
        m = self.manifest(instrument)
        return SourceInfo(provider=m["provider"], kind="HISTORICAL_SNAPSHOT" if m["kind"] != "DEMO_SYNTHETIC" else m["kind"],
                          description=m["description"], retrieved_at=m["retrieved_at"], content_sha256=m["sha256"],
                          adjusted=m.get("adjusted", "unknown"), terms=m.get("terms", ""),
                          adjustment_evidence=m.get("adjustment_evidence", ""))

    def bars(self, instrument):
        m = self.manifest(instrument)
        path = self.directory / f"{instrument}.csv"
        if _sha256(path) != m["sha256"]:
            raise ProviderError(f"snapshot {path.name} does not match its manifest hash (edited or corrupted)")
        return parse_csv(path.read_text(), instrument, source=m["provider"], received_at=m["retrieved_at"])


def parse_csv(text, instrument, source, received_at=""):
    rows, out = csv.DictReader(io.StringIO(text)), []
    for r in rows:
        k = {key.strip().lower(): v for key, v in r.items() if key}
        try:
            out.append(Bar(instrument, date.fromisoformat(k["date"].strip()), float(k["open"]), float(k["high"]),
                           float(k["low"]), float(k["close"]), float(k.get("volume") or 0), "USD", source, received_at))
        except (KeyError, ValueError) as e:
            raise ProviderError(f"unparseable row for {instrument}: {r} ({e})")
    return out


class StooqProvider:
    """Optional Stooq end-of-day source. Research-only; not a live or contractual feed.

    Access (as of the 2026-10-21 audit; the primary stooq.com pages could not be reached from the audit environment,
    so this rests on secondary reports dated March/April 2026): Stooq now answers the plain CSV URL with an HTML page
    asking for an API key, which a person obtains on the website (a CAPTCHA is reported), and applies a daily request
    quota. This class never tries to obtain a key, solve a CAPTCHA, retry or work around a limit. The key is read from
    the STOOQ_API_KEY environment variable, never stored, logged, written to a manifest or put in an error message.
    The query-parameter name below is NOT verified against Stooq documentation; if Stooq rejects it the download fails
    visibly. Adjustment status of the returned prices is unknown and is recorded as such."""
    name = "stooq"
    URL = "https://stooq.com/q/d/l/?s={sym}&i=d"
    KEY_PARAM = "apikey"      # UNVERIFIED parameter name; confirm on stooq.com after obtaining a key
    KEY_ENV = "STOOQ_API_KEY"

    def __init__(self, timeout=20, opener=None, api_key=None):
        self.timeout, self.opener = timeout, opener or urllib.request.urlopen
        self.api_key = api_key if api_key is not None else os.environ.get(self.KEY_ENV, "")

    def _url(self, sym):
        url = self.URL.format(sym=sym)
        return url + f"&{self.KEY_PARAM}={urllib.parse.quote(self.api_key)}" if self.api_key else url

    def fetch(self, instrument, symbol=None):
        sym = (symbol or f"{instrument.lower()}.us")
        try:
            with self.opener(self._url(sym), timeout=self.timeout) as resp:
                text = resp.read().decode("utf-8", "replace")
        except Exception as e:  # network, proxy, rate limit: fail visibly, never echo the URL (it may hold the key)
            raise ProviderError(f"stooq download failed for {sym}: {type(e).__name__}")
        head = text.lstrip()[:400].lower()
        if "daily hits limit" in head or "exceeded" in head and "limit" in head:
            raise ProviderError(f"stooq daily request limit reached for {sym}; stop and try again tomorrow. "
                                "Do not retry in a loop.")
        if not head.startswith("date"):
            hint = ("Stooq returned a web page, not CSV. It now appears to require an API key (set "
                    f"{self.KEY_ENV} after obtaining one yourself on stooq.com, or download the CSV by hand and use "
                    "scripts/import_csv.py)." if not self.api_key else
                    "Stooq returned a web page, not CSV: the key may be wrong or expired, the quota may be spent, or "
                    "the parameter name changed. Nothing was written.")
            raise ProviderError(f"stooq returned no CSV for {sym}. {hint}")
        retrieved = now_iso()
        bars = parse_csv(text, instrument, "stooq", retrieved)
        info = SourceInfo(provider="stooq", kind="HISTORICAL_DOWNLOADED",
                          description=f"Stooq daily CSV for {sym}; end-of-day, research-only, not live",
                          retrieved_at=retrieved, adjusted="unknown",
                          terms="Personal research use only; Stooq terms not verified in the audit; do not redistribute")
        return bars, info


class MassiveProvider:
    """Optional end-of-day daily bars from Massive (formerly Polygon.io): GET /v2/aggs/ticker/{T}/range/1/day/{from}/{to}.

    What is and is not verified (see docs/audit/data-source-review.md). The Basic (free) plan is reported as all US
    tickers, 2 years of history, end-of-day data and 5 API calls per minute. The official pages could not be fetched from
    the build environment, so the founder must confirm the plan, terms and response shape before relying on it.
    `adjusted=true` is understood to mean SPLIT-adjusted only (no dividends): imports are recorded as
    `split_adjusted_only`, which keeps every dataset PROVISIONAL until scripts/check_adjustment.py verifies a
    split-and-dividend-adjusted series against an independent reference.

    Safety: the key is read from MASSIVE_API_KEY, sent in an Authorization header (never in the URL), and never stored,
    logged, written to a manifest or put in an error. Calls are spaced to stay under 5 per minute; HTTP 429 or a quota
    message stops the import with no retry. Current-day bars are never requested (end-of-day only, previous sessions)."""
    name = "massive"
    BASE = "https://api.massive.com"
    KEY_ENV = "MASSIVE_API_KEY"
    MIN_INTERVAL_S = 12.5          # 5 calls/minute with margin
    MAX_PAGES = 4

    def __init__(self, timeout=30, opener=None, api_key=None, sleep=None, clock=None):
        import time as _t
        self.timeout, self.opener = timeout, opener or urllib.request.urlopen
        self.api_key = api_key if api_key is not None else os.environ.get(self.KEY_ENV, "")
        self.sleep, self.clock = sleep or _t.sleep, clock or _t.monotonic
        self._last = None
        self.calls = 0

    def _get(self, url):
        if not self.api_key:
            raise ProviderError(f"no Massive key: set {self.KEY_ENV} in your shell (never in a file in the repository)")
        if self._last is not None:
            wait = self.MIN_INTERVAL_S - (self.clock() - self._last)
            if wait > 0:
                self.sleep(wait)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.api_key}",
                                                   "User-Agent": "LocalQuantLab/0.1 (personal research)"})
        self._last = self.clock()
        self.calls += 1
        try:
            with self.opener(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            e.close()      # the error carries the server's response: release the connection now
            if e.code == 429:
                raise ProviderError("Massive rate limit reached (HTTP 429): stop and wait; the import does not retry")
            if e.code in (401, 403):
                raise ProviderError(f"Massive refused the request (HTTP {e.code}): key missing, wrong or not entitled")
            raise ProviderError(f"Massive request failed: HTTP {e.code}")
        except Exception as e:     # never echo the request: it carries the key in a header
            raise ProviderError(f"Massive request failed: {type(e).__name__}")
        try:
            return raw, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ProviderError("Massive returned something that is not JSON; nothing was written")

    def fetch(self, instrument, start, end, symbol=None):
        """Daily split-adjusted bars for [start, end] (ISO dates; end must be before today). Returns (bars, info, raw
        pages as bytes, request description)."""
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        sym = (symbol or instrument).upper()
        if date.fromisoformat(end) >= date.today():
            raise ProviderError("end must be a past session: end-of-day data only, never the current day")
        path = f"/v2/aggs/ticker/{urllib.parse.quote(sym)}/range/1/day/{start}/{end}"
        url = f"{self.BASE}{path}?adjusted=true&sort=asc&limit=50000"
        ny = ZoneInfo("America/New_York")
        pages, results = [], []
        for _ in range(self.MAX_PAGES):
            raw, body = self._get(url)
            pages.append(raw)
            status = str(body.get("status", ""))
            if status not in ("OK", "DELAYED"):
                raise ProviderError(f"Massive returned status {status or 'missing'} for {sym}: "
                                    f"{str(body.get('error') or body.get('message') or '')[:160]}")
            if body.get("adjusted") is not True:
                raise ProviderError(f"Massive did not confirm adjusted=true for {sym}; refusing to label the series")
            results.extend(body.get("results") or [])
            nxt = body.get("next_url")
            if not nxt:
                break
            if not str(nxt).startswith(self.BASE + "/"):
                raise ProviderError("Massive pagination pointed to another host; stopped")
            url = nxt
        else:
            raise ProviderError(f"more than {self.MAX_PAGES} pages for {sym}; narrow the date range")
        if not results:
            raise ProviderError(f"Massive returned no bars for {sym} {start}..{end}")
        bars, retrieved = [], now_iso()
        for r in results:
            try:
                d = datetime.fromtimestamp(int(r["t"]) / 1000, tz=timezone.utc).astimezone(ny).date()
                bars.append(Bar(instrument, d, float(r["o"]), float(r["h"]), float(r["l"]), float(r["c"]),
                                float(r.get("v") or 0), "USD", "massive", retrieved))
            except (KeyError, TypeError, ValueError) as e:
                raise ProviderError(f"unparseable Massive bar for {sym}: {e}")
        info = SourceInfo(provider="massive", kind="HISTORICAL_DOWNLOADED",
                          description=f"Massive daily aggregates for {sym} {start}..{end}; end-of-day, research-only, not live",
                          retrieved_at=retrieved, adjusted="split_adjusted_only",
                          terms="Massive Basic plan: individual/personal research use as reported; terms not verified "
                                "from the build environment; do not redistribute")
        request = {"endpoint": path, "query": "adjusted=true&sort=asc&limit=50000", "pages": len(pages),
                   "timestamp_convention": "bar t = start of the session window in Unix ms; converted to the "
                                           "America/New_York calendar date", "symbol": sym}
        return bars, info, pages, request
