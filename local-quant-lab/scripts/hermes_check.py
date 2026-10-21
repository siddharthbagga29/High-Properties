#!/usr/bin/env python3
"""Run on the founder's Mac after installing Hermes. Read-only except for state/hermes_check.json and, with
--memory-roundtrip, one test memory written through Hermes itself. No downloads, no installs, no paid calls.

    python3 scripts/hermes_check.py                    # hardware + Hermes/Ollama inventory
    python3 scripts/hermes_check.py --memory-roundtrip # also: write a memory in session 1, recall it in session 2
"""
import argparse
import json
import platform
import secrets
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sh(cmd, timeout=30):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"cmd": " ".join(cmd), "rc": r.returncode, "out": (r.stdout or "")[-2000:], "err": (r.stderr or "")[-800:]}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {"cmd": " ".join(cmd), "rc": None, "error": f"{type(e).__name__}: {e}"}


def ask(hermes, text, timeout):
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(text)
    try:
        return sh([hermes, "chat", "--query-file", f.name], timeout=timeout)  # documented in the Hermes CLI guide
    finally:
        Path(f.name).unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--memory-roundtrip", action="store_true")
    ap.add_argument("--timeout", type=int, default=600)
    a = ap.parse_args()
    rep = {"at": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(), "machine": platform.machine(),
           "python": sys.version.split()[0]}
    if sys.platform == "darwin":
        rep["macos"] = sh(["sw_vers"]).get("out", "")
        rep["cpu"] = sh(["sysctl", "-n", "machdep.cpu.brand_string"]).get("out", "").strip()
        mem = sh(["sysctl", "-n", "hw.memsize"]).get("out", "").strip()
        rep["ram_gb"] = round(int(mem) / 2 ** 30, 1) if mem.isdigit() else None
    rep["disk_free_gb"] = round(shutil.disk_usage(str(Path.home())).free / 2 ** 30, 1)
    rep["uv"] = shutil.which("uv")
    rep["ollama"] = shutil.which("ollama")
    if rep["ollama"]:
        rep["ollama_models"] = sh(["ollama", "list"])
    hermes = shutil.which("hermes")
    rep["hermes"] = hermes
    if hermes:
        rep["hermes_version"] = sh([hermes, "--version"])
        rep["hermes_memory_status"] = sh([hermes, "memory", "status"])
    if a.memory_roundtrip:
        if not hermes:
            rep["memory_roundtrip"] = {"ok": False, "detail": "hermes not installed"}
        else:
            nonce = "LQL-CHECK-" + secrets.token_hex(4)
            w = ask(hermes, f"Save this to your persistent memory exactly: '{nonce} is the Local Quant Lab memory "
                            "check token.' Then reply 'saved'.", a.timeout)
            r = ask(hermes, "What is the Local Quant Lab memory check token? Reply with the token only.", a.timeout)
            rep["memory_roundtrip"] = {"ok": nonce in (r.get("out") or ""), "nonce": nonce, "write": w, "recall": r}
    out = ROOT / "state" / "hermes_check.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(rep, indent=1))
    print(json.dumps({k: v for k, v in rep.items() if k != "ollama_models"}, indent=1)[:4000])
    print(f"\nWrote {out}. Record the result in docs/HERMES_INTEGRATION.md and docs/ACCEPTANCE_CHECKLIST.md.")


if __name__ == "__main__":
    main()
