#!/usr/bin/env python3
"""Helper for driving Lightricks LTX-Video inference.

Reads the vendored pipeline configs, enforces the model's hard input
constraints, and emits a ready-to-run inference.py command.

Examples:
  python3 ltxv.py models
  python3 ltxv.py validate --height 704 --width 1216 --num-frames 121
  python3 ltxv.py cmd --model ltxv-13b-0.9.8-distilled --prompt "a cat" \
      --image ref.png --height 704 --width 1216 --num-frames 121
"""
import argparse
import os
import re
import sys

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(SKILL_ROOT, "configs")

# Curated guidance that is not machine-readable from the YAML itself.
# Sourced from the upstream README "Models" table.
NOTES = {
    "ltxv-13b-0.9.8-dev": "Highest quality. Needs the most VRAM.",
    "ltxv-13b-0.9.8-dev-fp8": "Quantized 13B dev. Ada-architecture GPU or newer.",
    "ltxv-13b-0.9.8-distilled": "Fast, less VRAM, slight quality drop. Best default for iteration.",
    "ltxv-13b-0.9.8-distilled-fp8": "Quantized 13B distilled. Fastest 13B option.",
    "ltxv-2b-0.9.8-distilled": "Smaller model. Fast generation on light VRAM.",
    "ltxv-2b-0.9.8-distilled-fp8": "Quantized 2B distilled. Lightest 0.9.8 option.",
    "ltxv-2b-0.9.6-dev": "Good quality, lower VRAM than 13B.",
    "ltxv-2b-0.9.6-distilled": "15x faster, real-time capable, no STG/CFG needed.",
    "ltxv-2b-0.9.5": "Legacy checkpoint.",
    "ltxv-2b-0.9.1": "Legacy checkpoint.",
    "ltxv-2b-0.9": "Legacy checkpoint (initial release).",
}

# Hard constraints from the upstream README parameter guide.
SPATIAL_MULTIPLE = 32
FRAME_MULTIPLE = 8  # num_frames must be 8n + 1
MAX_RECOMMENDED_DIM = (720, 1280)
MAX_RECOMMENDED_FRAMES = 257


def scalar(text, key):
    m = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*(?:#.*)?$", text, re.M)
    return m.group(1).strip().strip('"') if m else None


def load_models():
    models = {}
    if not os.path.isdir(CONFIG_DIR):
        return models
    for fn in sorted(os.listdir(CONFIG_DIR)):
        if not fn.endswith(".yaml"):
            continue
        name = fn[:-5]
        with open(os.path.join(CONFIG_DIR, fn), encoding="utf-8") as f:
            text = f.read()
        models[name] = {
            "config": f"configs/{fn}",
            "pipeline_type": scalar(text, "pipeline_type"),
            "precision": scalar(text, "precision"),
            "checkpoint": scalar(text, "checkpoint_path"),
            "steps": scalar(text, "num_inference_steps"),
            "multi_scale": "first_pass:" in text,
            "note": NOTES.get(name, ""),
        }
    return models


def cmd_models(args):
    models = load_models()
    if not models:
        print(f"No configs found under {CONFIG_DIR}", file=sys.stderr)
        sys.exit(1)
    for name, m in models.items():
        steps = m["steps"] or ("multi-scale passes" if m["multi_scale"] else "?")
        print(f"{name}")
        print(f"    config     {m['config']}")
        print(f"    pipeline   {m['pipeline_type']}   precision {m['precision']}   steps {steps}")
        print(f"    checkpoint {m['checkpoint']}")
        if m["note"]:
            print(f"    {m['note']}")


def snap_dim(v):
    """Round a spatial dimension to the nearest valid multiple of 32."""
    return max(SPATIAL_MULTIPLE, round(v / SPATIAL_MULTIPLE) * SPATIAL_MULTIPLE)


def snap_frames(v):
    """Round a frame count to the nearest valid 8n + 1."""
    n = max(0, round((v - 1) / FRAME_MULTIPLE))
    return n * FRAME_MULTIPLE + 1


def check(height, width, num_frames):
    """Return (ok, problems, suggestions) for a requested output shape."""
    problems, suggestions = [], []

    for label, v in (("height", height), ("width", width)):
        if v % SPATIAL_MULTIPLE != 0:
            problems.append(f"{label}={v} is not divisible by {SPATIAL_MULTIPLE}")
            suggestions.append(f"{label} -> {snap_dim(v)}")

    if (num_frames - 1) % FRAME_MULTIPLE != 0:
        problems.append(f"num_frames={num_frames} is not a multiple of {FRAME_MULTIPLE} plus 1")
        suggestions.append(f"num_frames -> {snap_frames(num_frames)}")

    warnings = []
    if height > MAX_RECOMMENDED_DIM[0] or width > MAX_RECOMMENDED_DIM[1]:
        warnings.append(
            f"{width}x{height} exceeds the recommended {MAX_RECOMMENDED_DIM[1]}x{MAX_RECOMMENDED_DIM[0]} ceiling; quality degrades above it"
        )
    if num_frames > MAX_RECOMMENDED_FRAMES:
        warnings.append(
            f"num_frames={num_frames} exceeds the recommended max of {MAX_RECOMMENDED_FRAMES}"
        )

    return (not problems), problems, suggestions, warnings


def cmd_validate(args):
    ok, problems, suggestions, warnings = check(args.height, args.width, args.num_frames)
    print(f"requested: {args.width}x{args.height}, {args.num_frames} frames")
    if ok:
        print("VALID: shape satisfies the model's divisibility rules")
    else:
        print("INVALID:")
        for p in problems:
            print(f"  - {p}")
        print("suggested fix:")
        for s in suggestions:
            print(f"  - {s}")
    for w in warnings:
        print(f"WARNING: {w}")
    sys.exit(0 if ok else 1)


def cmd_build(args):
    models = load_models()
    if args.model not in models:
        print(f"Unknown model '{args.model}'. Run `ltxv.py models` for the list.", file=sys.stderr)
        sys.exit(1)

    ok, problems, suggestions, warnings = check(args.height, args.width, args.num_frames)
    height, width, num_frames = args.height, args.width, args.num_frames

    if not ok:
        if args.strict:
            print("Refusing to build an invalid command:", file=sys.stderr)
            for p in problems:
                print(f"  - {p}", file=sys.stderr)
            sys.exit(1)
        height, width = snap_dim(height), snap_dim(width)
        num_frames = snap_frames(num_frames)
        print(
            f"# auto-corrected {args.width}x{args.height}/{args.num_frames}f "
            f"-> {width}x{height}/{num_frames}f",
            file=sys.stderr,
        )

    for w in warnings:
        print(f"# warning: {w}", file=sys.stderr)

    parts = [
        "python inference.py",
        f'--prompt "{args.prompt}"',
        f"--height {height}",
        f"--width {width}",
        f"--num_frames {num_frames}",
        f"--seed {args.seed}",
        f"--pipeline_config {models[args.model]['config']}",
    ]

    if args.image:
        parts.insert(2, f"--conditioning_media_paths {' '.join(args.image)}")
        starts = args.start_frames or [0] * len(args.image)
        if len(starts) != len(args.image):
            print("--start-frames must have one value per --image", file=sys.stderr)
            sys.exit(1)
        parts.insert(3, f"--conditioning_start_frames {' '.join(str(s) for s in starts)}")

    if args.negative_prompt:
        parts.append(f'--negative_prompt "{args.negative_prompt}"')
    if args.offload_to_cpu:
        parts.append("--offload_to_cpu")
    if args.output:
        parts.append(f"--output_path {args.output}")

    print(" \\\n    ".join(parts))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("models", help="list available pipeline configs and their tradeoffs").set_defaults(func=cmd_models)

    v = sub.add_parser("validate", help="check a resolution/frame count against model constraints")
    v.add_argument("--height", type=int, required=True)
    v.add_argument("--width", type=int, required=True)
    v.add_argument("--num-frames", dest="num_frames", type=int, required=True)
    v.set_defaults(func=cmd_validate)

    c = sub.add_parser("cmd", help="build a runnable inference.py command")
    c.add_argument("--model", required=True)
    c.add_argument("--prompt", required=True)
    c.add_argument("--image", nargs="+", help="conditioning image/video path(s)")
    c.add_argument("--start-frames", dest="start_frames", nargs="+", type=int,
                   help="target frame index for each conditioning item (default all 0)")
    c.add_argument("--height", type=int, default=704)
    c.add_argument("--width", type=int, default=1216)
    c.add_argument("--num-frames", dest="num_frames", type=int, default=121)
    c.add_argument("--seed", type=int, default=171198)
    c.add_argument("--negative-prompt", dest="negative_prompt")
    c.add_argument("--output")
    c.add_argument("--offload-to-cpu", dest="offload_to_cpu", action="store_true",
                   help="trade speed for lower VRAM")
    c.add_argument("--strict", action="store_true",
                   help="fail instead of auto-correcting an invalid shape")
    c.set_defaults(func=cmd_build)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
