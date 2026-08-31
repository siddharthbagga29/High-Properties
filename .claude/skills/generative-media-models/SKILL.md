---
name: generative-media-models
description: Catalog of 440 hosted image, video, audio and lipsync generation models (Veo, Kling, Sora, Flux, Seedance, Wan, Hailuo, Nano Banana and more) plus 12 keyless models that run locally, with their exact model IDs, endpoints and input parameters. Use when picking a model for text-to-image, text-to-video, image-to-video, video-to-video, lipsync or audio generation, when you need a model's parameter schema (aspect ratios, duration, resolution enums), or when deciding between paid hosted APIs and free local generation. Triggers on "generate an image", "generate a video", "text to video model", "image to video", "which AI video model", "Veo", "Kling", "Sora", "Flux", "Higgsfield", "muapi", or questions about generative media model options and costs.
---

# Generative media model catalog

Merged model catalog extracted from two sibling repos, both by the same author,
both front-ends for the same backend:

- [Autom8AI/Open-Higgsfield-AI](https://github.com/Autom8AI/Open-Higgsfield-AI) — 221 models
- [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) — 438 models

Checked out 2026-08-31.

## Read this before recommending anything

**"Open" here means the client app is open source. It does not mean the models
are free.** All 440 hosted models are served through [muapi.ai](https://muapi.ai)
and require a paid API key. There is no free tier in the catalog data. If someone
asks for free generation, point them at the local models below, not these.

**The two repos overlap almost completely.** 219 of Open-Higgsfield-AI's 221
models also exist in Open-Generative-AI. Only two are unique to Higgsfield:
`higgsfield-soul-image-to-image` and `higgsfield-dop-image-to-video`. Treat
Open-Generative-AI as the superset and ignore the other unless one of those two
models is specifically wanted. That is why this is one skill and not two.

## The 12 models that actually cost nothing

These run on the user's own hardware with no API key:

| Provider | Models | Notes |
|---|---|---|
| `sdcpp` (bundled engine) | Z-Image Turbo (3.4GB), Z-Image Base (3.5GB), Dreamshaper 8 (2.1GB), Realistic Vision v5.1 (2.1GB), Anything v5 (2.1GB), SDXL Base 1.0 (6.9GB) | Weights download to disk, image only |
| `wan2gp` (user-run Gradio server) | Flux.1 Dev, Qwen Image, Wan 2.2 T2V, Wan 2.2 I2V, Hunyuan Video, LTX Video | Needs a separate Wan2GP server running |

```bash
python3 .claude/skills/generative-media-models/scripts/query_models.py --local
```

Z-Image Turbo is the best starting point: 6B params, 8 steps, 3.4GB, image only.
For local video, the wan2gp route requires standing up Wan2GP separately, which
is a real setup burden. Note `wan2gp:ltx-video` is the same LTX-Video covered by
the `ltx-video` skill in this repo, which has far more operating detail.

## Searching the hosted catalog

```bash
S=.claude/skills/generative-media-models/scripts/query_models.py

python3 $S --stats                              # counts by category and repo
python3 $S --search veo --show-params           # find a model, see its inputs
python3 $S --category text-to-video --limit 20
python3 $S --search kling --json                # machine-readable
```

Categories and counts:

| Category | Models |
|---|---|
| image-to-video | 132 |
| text-to-video | 90 |
| image-to-image | 75 |
| text-to-image | 72 |
| video-to-video | 36 |
| audio | 17 |
| lipsync | 15 |
| recast | 3 |

`--show-params` is the reason this catalog is worth having: it gives each
model's real input schema, including aspect ratio enums, duration defaults, and
resolution options, so a call can be constructed without guessing.

## Calling a hosted model

Every hosted model resolves to a muapi.ai endpoint. The flow implemented in both
repos (`src/lib/muapi.js`) is submit-then-poll: POST the prompt and parameters to
the model's endpoint, receive a job id, poll until the result URL appears.

This skill carries model IDs and parameter schemas, not muapi's request format,
auth headers, or pricing. Read https://muapi.ai docs before writing a client, and
tell the user a paid key is required rather than writing code that will 401.

## Running the apps themselves

Both repos are Vite plus Electron desktop apps with an optional Next.js surface.
Open-Generative-AI additionally ships Docker support and sub-packages
(`Open-AI-Design-Agent`, `Open-Poe-AI`, `Vibe-Workflow`). Neither app is vendored
here, only their model data. Clone upstream to run them. Prebuilt desktop
installers are linked from each README, and the macOS builds are unnotarized, so
they need `xattr -cr` on first launch.

## Data files

- `data/models.json` — 440 hosted models with category, id, endpoint, family,
  parameter schema, and which repo each came from
- `data/local-models.json` — the 12 keyless local models with sizes, default
  steps, and aspect ratios
- `references/notes.md` — architecture notes and the extraction method
