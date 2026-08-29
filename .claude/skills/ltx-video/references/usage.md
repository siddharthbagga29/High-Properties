# LTX-Video usage reference

Companion detail for the `ltx-video` skill. Source: upstream README at
https://github.com/Lightricks/LTX-Video (checked out 2026-08-29).

## Model matrix

| Model | Pipeline | Precision | Notes |
|---|---|---|---|
| `ltxv-13b-0.9.8-dev` | multi-scale | bfloat16 | Highest quality, most VRAM |
| `ltxv-13b-0.9.8-dev-fp8` | multi-scale | float8_e4m3fn | Quantized 13B dev |
| `ltxv-13b-0.9.8-distilled` | multi-scale | bfloat16 | Fast, slight quality drop, best for iteration |
| `ltxv-13b-0.9.8-distilled-fp8` | multi-scale | float8_e4m3fn | Fastest 13B |
| `ltxv-2b-0.9.8-distilled` | multi-scale | bfloat16 | Light VRAM |
| `ltxv-2b-0.9.8-distilled-fp8` | multi-scale | float8_e4m3fn | Lightest 0.9.8 |
| `ltxv-2b-0.9.6-dev` | base | bfloat16 | 40 steps, lower VRAM than 13B |
| `ltxv-2b-0.9.6-distilled` | base | bfloat16 | 8 steps, real-time capable |
| `ltxv-2b-0.9.5` / `0.9.1` / `0.9` | base | bfloat16 | Legacy |

There is also a **13b-0.9.8-mix** workflow that runs dev and distilled together
in one multi-scale render for a speed/quality balance. It is ComfyUI-only, there
is no `inference.py` config for it.

Multi-scale configs render a first pass at `downscale_factor` 0.667, then upscale
with `ltxv-spatial-upscaler-0.9.8.safetensors` and run a refining second pass.
Both checkpoints must be present.

Shared across all configs:
- Text encoder: `PixArt-alpha/PixArt-XL-2-1024-MS`
- Prompt enhancer captioner: `MiaoshouAI/Florence-2-large-PromptGen-v2.0`
- Prompt enhancer LLM: `unsloth/Llama-3.2-3B-Instruct`
- Enhancement kicks in below `prompt_enhancement_words_threshold: 120`

## Parameter guide

| Parameter | Default | Guidance |
|---|---|---|
| `height` / `width` | 704 / 1216 | Must be divisible by 32. Best under 720x1280 |
| `num_frames` | 121 | Must be 8n+1. Best under 257 |
| `frame_rate` | 30 | 121 frames at 30fps is about 4 seconds |
| `seed` | 171198 | Reuse to reproduce a look |
| `guidance_scale` | per config | 3 to 3.5 for non-distilled. Distilled uses 1 |
| `num_inference_steps` | per config | 40+ for quality, 20-30 for speed, 8 for distilled |
| `negative_prompt` | "worst quality, inconsistent motion, blurry, jittery, distorted" | Usually leave as is |
| `image_cond_noise_scale` | 0.15 | Noise added to the conditioning image |
| `offload_to_cpu` | false | Lowers VRAM, slower |
| `stg_scale` | per config | Spatiotemporal skip guidance. 0 for distilled |

0.9.8 distilled models support long-shot generation up to 60 seconds, and are
compatible with the official IC-LoRAs.

## Prompt engineering

One flowing paragraph, under 200 words, chronological, literal. Order:

1. Main action, one sentence
2. Movements and gestures
3. Character and object appearance
4. Background and environment
5. Camera angle and movement
6. Lighting and color
7. Sudden changes or events

Bad: `a nice video of a house`

Good: `The camera glides forward down a curved driveway toward a modern
three-story house, moving at a steady walking pace. Floor-to-ceiling windows
reflect the low sun as the camera passes a row of young palms. The facade is
pale limestone with dark timber accents and a cantilevered upper balcony.
Behind the house, low hills fade into haze. The shot is a smooth low-angle
dolly, warm golden-hour light raking across the stone, long shadows stretching
left across the gravel.`

Enable automatic enhancement with `enhance_prompt=True` when calling
`LTXVideoPipeline` directly.

## Conditioning

`--conditioning_media_paths` takes one or more images or short video clips.
`--conditioning_start_frames` gives the target frame index for each, and the two
lists must be the same length. `--conditioning_strengths` sets per-item strength
between 0 and 1, default 1.0.

- One image at frame 0 is standard image-to-video
- Images at frames 0 and N are start/end keyframing
- A video clip plus a target frame extends that clip

**Video extension rule:** input video segments must contain 8n+1 frames (9, 17,
25...), and the target `num_frames` should be a multiple of 8. This differs from
the general 8n+1 rule for output length, and is a common source of errors.

## Library API

```python
from ltx_video.inference import infer, InferenceConfig

infer(
    InferenceConfig(
        pipeline_config="configs/ltxv-13b-0.9.8-distilled.yaml",
        prompt=PROMPT,
        height=704,
        width=1216,
        num_frames=121,
        output_path="output.mp4",
    )
)
```

`InferenceConfig` fields: `prompt`, `output_path`, `pipeline_config`, `seed`,
`height`, `width`, `num_frames`, `frame_rate`, `offload_to_cpu`,
`negative_prompt`, `input_media_path`, `image_cond_noise_scale`,
`conditioning_media_paths`, `conditioning_strengths`,
`conditioning_start_frames`.

## Control models

IC-LoRA control adapters on HuggingFace under `Lightricks/`:

- `LTX-Video-ICLoRA-depth-13b-0.9.7`
- `LTX-Video-ICLoRA-pose-13b-0.9.7`
- `LTX-Video-ICLoRA-canny-13b-0.9.7`
- `LTX-Video-ICLoRA-detailer-13b-0.9.8`

These run through ComfyUI workflows, not `inference.py`.

## Ecosystem

- ComfyUI nodes: https://github.com/Lightricks/ComfyUI-LTXVideo (upstream calls
  this the recommended path for best quality)
- Diffusers: https://huggingface.co/docs/diffusers/main/en/api/pipelines/ltx_video
- Fine-tuning and LoRA training: https://github.com/Lightricks/LTX-Video-Trainer
- FP8 kernels: https://github.com/Lightricks/LTXVideo-Q8-Kernels
- Community nodes: ComfyUI-LTXTricks (RF-Inversion, FlowEdit), LTX-VideoQ8, TeaCache

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Output silently cropped or padded | Dimensions not divisible by 32, or frames not 8n+1 | Run `ltxv.py validate` |
| CUDA OOM | Model too large for the card | Use a distilled or 2B config, add `--offload_to_cpu` |
| fp8 config fails to load | Q8 kernels not installed | Install LTXVideo-Q8-Kernels, or switch to bfloat16 |
| Static or barely moving video | Prompt too vague | Rewrite with explicit motion and camera movement |
| Video extension errors | Input clip not 8n+1 frames | Trim the source clip to 9, 17, 25... frames |
| Multi-scale config errors on missing file | Spatial upscaler not downloaded | Fetch `ltxv-spatial-upscaler-0.9.8.safetensors` |
| Quality worse than expected | Above 720x1280 or 257 frames | Generate within limits, upscale afterward |
