#!/usr/bin/env python3
"""Re-parse a public-apis/public-apis README.md into data/apis.json.

Usage:
  python3 refresh_catalog.py /path/to/public-apis/README.md
"""
import json
import os
import re
import sys

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "apis.json")

ROW_RE = re.compile(
    r"^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|"
)


def parse(readme_path):
    with open(readme_path, encoding="utf-8") as f:
        lines = f.readlines()

    categories = {}
    current_category = None
    in_table = False

    for raw in lines:
        line = raw.rstrip("\n")

        if line.startswith("### "):
            current_category = line[4:].strip()
            if current_category.startswith("APIs Covered Under"):
                current_category = None
                continue
            categories.setdefault(current_category, [])
            in_table = False
            continue

        if current_category is None:
            continue

        if line.startswith("API | Description") or line.startswith("|:---"):
            in_table = True
            continue

        if line.startswith("**[") or line.strip() == "":
            in_table = False
            continue

        if in_table and line.startswith("|"):
            m = ROW_RE.match(line)
            if m:
                name, url, desc, auth, https, cors = m.groups()
                auth = auth.replace("`", "").strip()
                categories[current_category].append({
                    "name": name.strip(),
                    "url": url.strip(),
                    "description": desc.strip(),
                    "auth": auth if auth else "No",
                    "https": https.strip(),
                    "cors": cors.strip(),
                })

    return {k: v for k, v in categories.items() if v}


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    readme_path = sys.argv[1]
    categories = parse(readme_path)
    total = sum(len(v) for v in categories.values())

    catalog = {
        "source": "https://github.com/public-apis/public-apis",
        "category_count": len(categories),
        "api_count": total,
        "categories": categories,
    }

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=1)

    print(f"Wrote {DATA_PATH}: {len(categories)} categories, {total} APIs", file=sys.stderr)


if __name__ == "__main__":
    main()
