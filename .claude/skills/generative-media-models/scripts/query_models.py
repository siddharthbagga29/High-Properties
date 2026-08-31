#!/usr/bin/env python3
"""Search the merged generative media model catalog.

Examples:
  python3 query_models.py --stats
  python3 query_models.py --local
  python3 query_models.py --category text-to-video
  python3 query_models.py --search veo
  python3 query_models.py --search kling --show-params
"""
import argparse
import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
HOSTED = os.path.join(DATA_DIR, "models.json")
LOCAL = os.path.join(DATA_DIR, "local-models.json")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cmd_stats():
    h = load(HOSTED)
    l = load(LOCAL)
    print(f"Hosted models (muapi.ai key required): {h['model_count']}")
    for cat, n in sorted(h["category_counts"].items()):
        print(f"    {cat:16s} {n}")
    print()
    print("Per source repo:")
    for repo, counts in h["per_repo_counts"].items():
        print(f"    {repo}: {sum(counts.values())}")
        for cat, n in sorted(counts.items()):
            print(f"        {cat:16s} {n}")
    print()
    print(f"Local models (NO API key, runs on your hardware): {l['model_count']}")
    for p in l["providers"]:
        n = sum(1 for m in l["models"] if m.get("provider") == p)
        print(f"    {p:8s} {n}")


def cmd_local(args):
    l = load(LOCAL)
    for m in l["models"]:
        if args.search and args.search.lower() not in (m["id"] + m.get("name", "")).lower():
            continue
        size = f"{m['sizeGB']}GB" if m.get("sizeGB") else "size varies"
        print(f"{m['id']}  [{m.get('provider')}]  {size}")
        print(f"    {m.get('name','')}")
        if m.get("description"):
            print(f"    {m['description']}")
        if m.get("defaultSteps"):
            print(f"    default steps: {m['defaultSteps']}  ratios: {', '.join(m.get('aspectRatios', []))}")


def cmd_search(args):
    h = load(HOSTED)
    results = []
    for cat, models in h["categories"].items():
        if args.category and cat != args.category:
            continue
        for m in models:
            if args.search:
                blob = (m["id"] + " " + m.get("name", "") + " " + (m.get("family") or "")).lower()
                if args.search.lower() not in blob:
                    continue
            results.append(m)

    if not results:
        print("No matches.", file=sys.stderr)
        sys.exit(1)

    shown = results if args.limit == 0 else results[: args.limit]
    if args.json:
        print(json.dumps(shown, indent=2))
    else:
        for m in shown:
            src = "both" if len(m["sources"]) > 1 else m["sources"][0]
            print(f"[{m['category']}] {m['id']}")
            print(f"    {m['name']}   endpoint={m['endpoint']}   in={src}")
            if args.show_params and m["params"]:
                for k, v in m["params"].items():
                    bits = [str(v.get("type"))]
                    if "enum" in v:
                        e = v["enum"]
                        bits.append("{" + ", ".join(map(str, e[:6])) + ("..." if len(e) > 6 else "") + "}")
                    if "default" in v:
                        bits.append(f"default={v['default']}")
                    if "min" in v or "max" in v:
                        bits.append(f"range {v.get('min')}..{v.get('max')}")
                    print(f"        {k}: {' '.join(bits)}")
        if len(results) > len(shown):
            print(f"\n... {len(results) - len(shown)} more (raise --limit)", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--stats", action="store_true", help="counts by category and source")
    p.add_argument("--local", action="store_true", help="list only the keyless local models")
    p.add_argument("--search", help="substring match on id, name, or family")
    p.add_argument("--category", help="text-to-image, text-to-video, image-to-video, image-to-image, video-to-video, lipsync, audio, recast")
    p.add_argument("--show-params", action="store_true", help="print each model's input parameters")
    p.add_argument("--json", action="store_true")
    p.add_argument("--limit", type=int, default=40, help="0 for no limit")
    args = p.parse_args()

    if args.stats:
        cmd_stats()
    elif args.local:
        cmd_local(args)
    else:
        cmd_search(args)


if __name__ == "__main__":
    main()
