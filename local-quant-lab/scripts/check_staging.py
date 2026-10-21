#!/usr/bin/env python3
"""Run before every commit on the Mac (the repository is public). Lists what git would stage and refuses if any path
looks like raw market data, a forward-log or paper database, a machine report, an env file or a bundle.

    python3 scripts/check_staging.py          # exit 0 = nothing sensitive would be committed
"""
import fnmatch
import subprocess
import sys

FORBIDDEN = ["*/data/snapshots/*.csv", "data/snapshots/*.csv", "*.manifest.json", "*/data/snapshots/archive/*",
             "data/snapshots/archive/*", "*/state/forward/*", "state/forward/*", "*hermes_check.json", "*.db",
             "*.db-journal", "*.zip", "*events.jsonl", "*/state/experiments/*", "state/experiments/*",
             "*/state/research/results/*", "state/research/results/*", "*.env", "*/.env", ".env", ".env.*",
             "*MEMORY.md", "*USER.md", "*/.hermes/*", "*/exports/*", "exports/*"]
ALLOWED = ["*.env.example", ".env.example", "*/.env.example"]


def violations(paths):
    bad = []
    for p in paths:
        if any(fnmatch.fnmatch(p, a) for a in ALLOWED):
            continue
        if any(fnmatch.fnmatch(p, f) for f in FORBIDDEN):
            bad.append(p)
    return bad


def would_stage():
    out = subprocess.run(["git", "add", "-A", "-n", "--", "."], capture_output=True, text=True, check=True).stdout
    return [line.split("'", 1)[1].rsplit("'", 1)[0] for line in out.splitlines() if "'" in line]


def main():
    paths = would_stage()
    print(f"{len(paths)} path(s) would be staged by `git add -A`:")
    for p in paths:
        print("  " + p)
    bad = violations(paths)
    if bad:
        print("\nREFUSING: these must not be committed:")
        for p in bad:
            print("  " + p)
        return 1
    print("\nOK: nothing that looks like market data, logs, databases, env files or machine reports.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
