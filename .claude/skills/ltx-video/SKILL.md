---
name: ltx-video
description: Lightricks LTX-Video, an open-source DiT-based text-to-video and image-to-video generation model. Use this skill when generating video from a text prompt or a still image, animating a photo, extending an existing video clip, choosing between LTX-Video model variants and their VRAM/speed tradeoffs, writing prompts for video generation, or debugging LTX-Video inference errors about resolution and frame counts. Triggers on "LTX-Video", "LTXV", "text to video", "image to video", "animate this image", "generate a video clip", or questions about video diffusion model parameters, conditioning, and keyframes.
---

# LTX-Video

Open-source video generation model from Lightricks. DiT-based, generates video
from a text prompt, from a conditioning image, or from existing video frames.
Repo: https://github.com/Lightricks/LTX-Video (Apache 2.0, checked out 2026-08-29).

## Read this first: what this skill can and cannot do

This skill carries the **operating knowledge** for LTX-Video: the model matrix,
the hard input constraints, prompt structure, and a command builder. It does not
carry the model weights, and generation needs a CUDA GPU plus multi-GB
checkpoints downloaded from HuggingFace.

If someone asks to actually generate a video and no GPU is present, say so
directly and point them at the hosted options rather than running a command that
will fail:
- LTX-Studio: https://app.ltx.studio/motion-workspace
- Fal.ai: https://fal.ai/models/fal-ai/ltx-video-13b-dev/image-to-video
- Replicate: https://replicate.com/lightricks/ltx-video

**Upstream status:** Lightricks has moved primary development to
[LTX-2](https://github.com/Lightricks/LTX-2), which adds synchronized audio plus
video, 4K, and up to 50fps. This repo (0.9.x) is still the released, downloadable
open-weights line. Mention LTX-2 when someone is starting something new.

## The two hard constraints that break inference

Almost every LTX-Video failure is one of these. Check them before anything else:

1. **Height and width must be divisible by 32.**
2. **num_frames must be a multiple of 8, plus 1** (9, 17, 25, ... 121, 257).

Out-of-spec inputs are padded with -1 and cropped, which quietly degrades output.
Quality also falls off above 720x1280 and above 257 frames.

Use the script rather than doing this arithmetic by hand:

```bash
python3 .claude/skills/ltx-video/scripts/ltxv.py validate \
    --height 1080 --width 1920 --num-frames 100
```

It reports exactly which rule was violated and the nearest valid value, and exits
non-zero so it can gate a pipeline.

## Picking a model

```bash
python3 .claude/skills/ltx-video/scripts/ltxv.py models
```

Reads the 11 vendored configs in `configs/` and prints pipeline type, precision,
step count, and checkpoint for each. Short version:

| Want | Use |
|---|---|
| Best quality, VRAM available | `ltxv-13b-0.9.8-dev` |
| Good default, iterating fast | `ltxv-13b-0.9.8-distilled` |
| Light VRAM | `ltxv-2b-0.9.8-distilled` |
| Ada-or-newer GPU, want speed | any `-fp8` variant |
| Real-time, 8 steps, no CFG/STG | `ltxv-2b-0.9.6-distilled` |

`fp8` variants need the separate [Q8 kernels](https://github.com/Lightricks/LTXVideo-Q8-Kernels).
Distilled models run without classifier-free guidance and spatiotemporal
guidance, which is why they are so much faster.

## Building a command

```bash
# text to video
python3 .claude/skills/ltx-video/scripts/ltxv.py cmd \
    --model ltxv-13b-0.9.8-distilled --prompt "PROMPT"

# image to video
python3 .claude/skills/ltx-video/scripts/ltxv.py cmd \
    --model ltxv-13b-0.9.8-distilled --prompt "PROMPT" --image ref.png

# multiple keyframes at chosen frame indices
python3 .claude/skills/ltx-video/scripts/ltxv.py cmd \
    --model ltxv-13b-0.9.8-dev --prompt "PROMPT" \
    --image start.png end.png --start-frames 0 120
```

It snaps invalid dimensions to the nearest legal value and prints what it
changed. Pass `--strict` to fail instead of auto-correcting. `--offload-to-cpu`
trades speed for lower VRAM.

The emitted command must be run from a clone of the LTX-Video repo, since
`--pipeline_config` paths are relative to it.

## Writing the prompt

This model is unusually sensitive to prompt structure. Vague prompts produce
static or incoherent motion. Write one flowing paragraph, under 200 words, in
this order:

1. Main action in a single sentence
2. Specific movements and gestures
3. Character and object appearances
4. Background and environment
5. Camera angle and camera movement
6. Lighting and color
7. Any sudden change or event

Write like a cinematographer describing a shot, literal and chronological. Start
directly with the action, no preamble like "a video of". Full detail and worked
examples in `references/usage.md`.

## Setup

```bash
git clone https://github.com/Lightricks/LTX-Video.git
cd LTX-Video
python -m venv env && source env/bin/activate
python -m pip install -e .\[inference\]
```

Python 3.10+, PyTorch 2.1.2+, tested on CUDA 12.2. macOS MPS works on torch 2.3
or 2.6+.

## Reference material

- `references/usage.md` — prompt recipes, parameter guide, conditioning,
  video extension rules, library API, control models, troubleshooting table
- `configs/` — all 11 upstream pipeline configs, vendored verbatim, so the
  exact sampler and guidance schedules are readable offline
