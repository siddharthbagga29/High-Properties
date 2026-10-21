import json
import tempfile
from datetime import date, timedelta
from pathlib import Path

from lql import config
from lql.data.schema import Bar

SETTINGS_DICT = json.loads((Path(__file__).resolve().parent.parent / "config" / "settings.json").read_text())


def settings(**risk_overrides):
    d = json.loads(json.dumps(SETTINGS_DICT))
    d["risk"].update(risk_overrides)
    return config.parse(d)


def bars(closes, inst="DEMO-ETF-A", start=date(2020, 1, 1), opens=None):
    out, d = [], start
    for i, c in enumerate(closes):
        o = opens[i] if opens else c
        out.append(Bar(inst, d, o, max(o, c) * 1.01, min(o, c) * 0.99, c, 1e6, "USD", "test"))
        d += timedelta(days=1)
    return out


def tmpdir():
    return Path(tempfile.mkdtemp(prefix="lqltest-"))
