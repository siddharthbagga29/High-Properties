"""Optional credentials file for the founder's machines. The lab reads credentials from environment variables only
(lql/console.py PROVIDER_ENV); this fills those variables from one local file so a scheduled job does not need them
typed into a shell. Values are never printed, logged or returned.

Search order (first file found wins): $LQL_ENV_FILE, ~/.config/lql/env, then the repository's own .env files. Every
.env is git-ignored (root and local-quant-lab .gitignore; scripts/check_staging.py refuses them too).

Rules: only the names in ALLOWED are read (a file cannot set PATH or anything else); a variable already set in the
environment wins (the Mac Keychain prefix in the launchd job keeps working); a file that other users can read
(mode & 0o077) is refused until `chmod 600`."""
import os
from pathlib import Path

from . import ROOT

ALLOWED = ("MASSIVE_API_KEY", "LQL_MASSIVE_TERMS_OK", "FRED_API_KEY", "BEA_API_USERID", "SEC_USER_AGENT",
           "STOOQ_API_KEY", "ALPACA_PAPER_KEY_ID", "ALPACA_PAPER_SECRET_KEY")
# Alpaca's own documented names, accepted for the paper key pair
ALIASES = {"APCA_API_KEY_ID": "ALPACA_PAPER_KEY_ID", "APCA_API_SECRET_KEY": "ALPACA_PAPER_SECRET_KEY"}


def candidates(env=None):
    env = os.environ if env is None else env
    out = [Path(env["LQL_ENV_FILE"]).expanduser()] if env.get("LQL_ENV_FILE") else []
    return out + [Path.home() / ".config" / "lql" / "env", ROOT.parent / ".env", ROOT / ".env"]


def parse(text):
    """KEY=VALUE lines; '#' comments, blank lines and an `export ` prefix allowed; one level of quotes stripped."""
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        out[k] = v
    return out


def load(path=None, env=None):
    """Fill missing allowed variables from the first credentials file found. Returns a report of NAMES only:
    {"path", "loaded", "kept_from_environment", "ignored", "refused"}."""
    env = os.environ if env is None else env
    paths = [Path(path)] if path else candidates(env)
    p = next((x for x in paths if x.is_file()), None)
    rep = {"path": str(p) if p else None, "loaded": [], "kept_from_environment": [], "ignored": [], "refused": None}
    if p is None:
        return rep
    if os.name == "posix" and p.stat().st_mode & 0o077:
        rep["refused"] = f"{p} can be read by other users: run  chmod 600 {p}"
        return rep
    for k, v in parse(p.read_text()).items():
        name = ALIASES.get(k, k)
        if name not in ALLOWED:
            rep["ignored"].append(k)
        elif env.get(name):
            rep["kept_from_environment"].append(name)
        elif v:
            env[name] = v
            rep["loaded"].append(name)
    return rep


def describe(rep):
    if rep["path"] is None:
        return "no credentials file found (looked in $LQL_ENV_FILE, ~/.config/lql/env, the repository .env)"
    if rep["refused"]:
        return f"credentials file refused: {rep['refused']}"
    s = f"credentials file {rep['path']}: loaded {', '.join(rep['loaded']) or 'nothing'}"
    if rep["kept_from_environment"]:
        s += f"; already set in the environment: {', '.join(rep['kept_from_environment'])}"
    if rep["ignored"]:
        s += f"; ignored unknown names: {', '.join(rep['ignored'])}"
    return s
