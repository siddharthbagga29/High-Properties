"""Market-data providers behind one interface. Vendor code stays here; strategies only see Bar objects.

- SyntheticProvider: deterministic seeded random walk on business days. Always labelled DEMO_SYNTHETIC.
- SnapshotProvider: reads a local CSV snapshot and its manifest (source, retrieval time, SHA-256).
- StooqProvider: optional free end-of-day CSV download (no key). Research-only, not a live or contractual feed.
  Downloads are written as snapshots so every run is reproducible offline.
"""
import csv
import hashlib
import io
import json
import math
import random
import urllib.request
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


def write_snapshot(instrument, bars, info, directory=SNAPSHOT_DIR):
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
                "adjusted": info.adjusted, "terms": info.terms}
    (directory / f"{instrument}.manifest.json").write_text(json.dumps(manifest, indent=2))
    return path, manifest


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
                          adjusted=m.get("adjusted", "unknown"), terms=m.get("terms", ""))

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
    """Optional free EOD source. Research-only; Stooq data may be adjusted and is not a contractual or live feed."""
    name = "stooq"
    URL = "https://stooq.com/q/d/l/?s={sym}&i=d"

    def __init__(self, timeout=20, opener=None):
        self.timeout, self.opener = timeout, opener or urllib.request.urlopen

    def fetch(self, instrument, symbol=None):
        sym = (symbol or f"{instrument.lower()}.us")
        try:
            with self.opener(self.URL.format(sym=sym), timeout=self.timeout) as resp:
                text = resp.read().decode("utf-8", "replace")
        except Exception as e:  # network, proxy, rate limit: fail visibly
            raise ProviderError(f"stooq download failed for {sym}: {e}")
        if not text.lower().startswith("date"):
            raise ProviderError(f"stooq returned no CSV for {sym} (first bytes: {text[:60]!r})")
        retrieved = now_iso()
        bars = parse_csv(text, instrument, "stooq", retrieved)
        info = SourceInfo(provider="stooq", kind="HISTORICAL_DOWNLOADED",
                          description=f"Stooq daily CSV for {sym}; end-of-day, research-only, not live",
                          retrieved_at=retrieved, adjusted="unknown (Stooq may split/dividend-adjust)",
                          terms="Personal research use; check stooq.com terms before redistribution")
        return bars, info
