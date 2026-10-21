"""Portable context bundle for any coding assistant (Claude, ChatGPT, Gemini, Hermes).

Collects text documentation, task state, configs, decision/build/research logs, the acceptance checklist, approved
project skills, the frozen regression set, learning logs and the user-provided brief into exports/context-<UTC>.zip
with a MANIFEST.json (path, bytes, sha256). Fail closed on secrets: `.env*`, databases, key files and Hermes private
memory (MEMORY.md / USER.md, anything under a .hermes directory) are never included, and every candidate file is
scanned; a file that looks like it holds a secret is left out and listed under `excluded`.
"""
import fnmatch
import hashlib
import json
import re
import time
import zipfile
from pathlib import Path

from . import ROOT

INCLUDE = ["PROJECT_CONTEXT.md", "README.md", "CHANGELOG.md", "Makefile", ".env.example", "docs/*.md",
           "project-brief/*.md", "project-brief/*.json", "config/*.json", "state/current_state.json",
           "state/research_runs.jsonl", "agent_learning/*.md", "agent_learning/evaluations.jsonl",
           "agent_learning/regression/*", "agent_learning/approved_skills/**/*",
           "reference_materials/*.png"]
NEVER = [".env", ".env.*", "*.db", "*.sqlite", "*.pem", "*.key", "id_rsa*", "MEMORY.md", "USER.md", "*.lock"]
NEVER_DIRS = (".hermes", ".git", "__pycache__", "exports")
SECRET_PATTERNS = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"\bxox[abpr]-[A-Za-z0-9-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"STOOQ_API_KEY['\"]?\s*[:=]\s*['\"]?(?!<|\$|your|changeme|placeholder|example|none|null|\[REDACTED\])[A-Za-z0-9_\-]{6,}"),
    re.compile(r"(?i)[?&]apikey=(?!<|\$|\[REDACTED\])[A-Za-z0-9_\-]{6,}"),
    re.compile(r"(?i)\b(api[_-]?key|secret[_-]?key|access[_-]?token|password)['\"]?\s*[:=]\s*['\"]?(?!<|\$\{|your|changeme|"
               r"placeholder|example|none|null|\[REDACTED\])[A-Za-z0-9_\-/+=]{12,}"),
]


def find_secret(data):
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None  # binary (images); not scanned as text
    for p in SECRET_PATTERNS:
        m = p.search(text)
        if m:
            return p.pattern[:40]
    return None


def candidates(root):
    root = Path(root)
    seen = set()
    for pat in INCLUDE:
        for p in sorted(root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                yield p


def build(root=ROOT, out_dir=None):
    root = Path(root)
    out_dir = Path(out_dir or root / "exports")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    dest = out_dir / f"context-{stamp}.zip"
    included, excluded = [], []
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for p in candidates(root):
            rel = p.relative_to(root).as_posix()
            never = p.name != ".env.example" and any(fnmatch.fnmatch(p.name, n) for n in NEVER)
            if never or any(d in p.parts for d in NEVER_DIRS):
                excluded.append({"path": rel, "reason": "never exported"})
                continue
            data = p.read_bytes()
            hit = find_secret(data)
            if hit:
                excluded.append({"path": rel, "reason": f"possible secret ({hit}...)"})
                continue
            z.writestr(rel, data)
            included.append({"path": rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        manifest = {"created_utc": stamp, "purpose": "Portable Local Quant Lab context. Start with PROJECT_CONTEXT.md, "
                    "then docs/BUILD_STATE.md.", "included": included, "excluded": excluded,
                    "policy": "No .env, databases, keys, Hermes private memory or files that look like secrets."}
        z.writestr("MANIFEST.json", json.dumps(manifest, indent=1))
    return dest, manifest
