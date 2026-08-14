#!/usr/bin/env python3
"""Search and filter the vendored public-apis/public-apis catalog.

Examples:
  python3 query_apis.py --list-categories
  python3 query_apis.py --category Weather
  python3 query_apis.py --search "real estate"
  python3 query_apis.py --search geocode --no-auth-only
  python3 query_apis.py --search maps --https-only --json
"""
import argparse
import json
import os
import sys

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "apis.json")


def load():
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def iter_apis(catalog):
    for category, apis in catalog["categories"].items():
        for api in apis:
            yield category, api


def matches(api, term):
    term = term.lower()
    return term in api["name"].lower() or term in api["description"].lower()


def print_api(category, api):
    auth = api["auth"] if api["auth"] != "No" else "no auth"
    print(f"[{category}] {api['name']} — {api['description']}")
    print(f"    {api['url']}  (auth: {auth}, https: {api['https']}, cors: {api['cors']})")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--search", help="keyword to match against API name/description")
    p.add_argument("--category", help="exact category name (see --list-categories)")
    p.add_argument("--no-auth-only", action="store_true", help="only APIs that need no auth")
    p.add_argument("--https-only", action="store_true", help="only APIs that support HTTPS")
    p.add_argument("--list-categories", action="store_true", help="print all category names with counts")
    p.add_argument("--json", action="store_true", help="emit matches as JSON instead of text")
    p.add_argument("--limit", type=int, default=50, help="max results to print (default 50, 0 = no limit)")
    args = p.parse_args()

    catalog = load()

    if args.list_categories:
        for name, apis in sorted(catalog["categories"].items()):
            print(f"{name} ({len(apis)})")
        return

    results = []
    for category, api in iter_apis(catalog):
        if args.category and category.lower() != args.category.lower():
            continue
        if args.search and not matches(api, args.search):
            continue
        if args.no_auth_only and api["auth"] != "No":
            continue
        if args.https_only and api["https"] != "Yes":
            continue
        results.append((category, api))

    if not results:
        print("No matches.", file=sys.stderr)
        sys.exit(1)

    shown = results if args.limit == 0 else results[: args.limit]

    if args.json:
        print(json.dumps([{"category": c, **a} for c, a in shown], indent=2))
    else:
        for category, api in shown:
            print_api(category, api)
        if len(results) > len(shown):
            print(f"\n... {len(results) - len(shown)} more (raise --limit or narrow the search)", file=sys.stderr)


if __name__ == "__main__":
    main()
