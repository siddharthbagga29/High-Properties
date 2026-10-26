"""Local Quant Lab: local-first research, backtesting, risk-governed simulation and paper trading.

Paper/simulated only. There is no live order route anywhere in this package.
"""
from pathlib import Path

__version__ = "0.1.0"
ROOT = Path(__file__).resolve().parent.parent


def code_fingerprint():
    """Hash of the lql package source as it is on disk now. A long-running server records it at start-up, so a
    script can tell when the server is still running code older than a `git pull`."""
    import hashlib
    h = hashlib.sha256()
    for p in sorted(Path(__file__).resolve().parent.rglob("*.py")):
        h.update(p.relative_to(ROOT).as_posix().encode() + b"\0" + p.read_bytes())
    return h.hexdigest()[:16]


CODE_FINGERPRINT = code_fingerprint()      # what this process loaded
