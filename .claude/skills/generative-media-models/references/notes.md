# Extraction notes and repo architecture

## Where the data came from

| File | Source |
|---|---|
| `data/models.json` | `src/lib/models.js` (Higgsfield) and `packages/studio/src/models.js` (Generative) |
| `data/local-models.json` | `src/lib/localModels.js` (Generative only) |

Both `models.js` files declare `export const <name>Models = [ ... ]` arrays whose
contents are plain JSON. The extractor brace-matches each array, strips `//`
comments that appear outside string literals (the `lipsyncModels` array has
them and fails a naive `JSON.parse`), then merges on `(category, id)`, recording
which repo each model came from in a `sources` list.

Verbose parts of each model's schema (long descriptions, per-field examples) were
dropped. What is kept per parameter: `type`, `enum`, `default`, `min`, `max`.
That is the part needed to construct a valid call.

To regenerate after pulling upstream, re-run the extraction against fresh clones.
The script lives in the session scratchpad rather than the repo, since it only
runs against upstream checkouts, not against anything in this project.

## Counts, verified

```
Open-Higgsfield-AI     221 models
Open-Generative-AI     438 models
merged unique          440 models
in both repos          219
only in Higgsfield       2   (higgsfield-soul-image-to-image,
                              higgsfield-dop-image-to-video)
only in Generative     219
local, no API key       12
```

The 438 + 221 - 219 = 440 arithmetic checks out.

## Repo architecture

Both repos share a skeleton: Vite build, Electron desktop wrapper, Tailwind,
vanilla-JS components, plus a Next.js `app/` directory. Both ship
`project_knowledge.md`, an author-written architecture document, and
`models_dump.json`, a smaller text-to-image-only dump (49 and 50 models) that
`models.js` is generated from.

Open-Generative-AI is the more developed of the two:

- `packages/studio/` holds the real model catalog (23k lines) shared by both build targets
- `packages/` also contains `Open-AI-Design-Agent`, `Open-Poe-AI`, `Vibe-Workflow`
- `src/lib/localModels.js` and `electron/lib/modelCatalog.js` add the local inference path
- Docker and docker-compose support
- `middleware.js`, a `tests/` directory, and `scripts/`

Open-Higgsfield-AI has none of the local inference path. Every model it exposes
is a muapi.ai call.

## Key client modules, if you need to write against the API

| File | Role |
|---|---|
| `src/lib/muapi.js` | Hosted API client. Auth, job submission, polling loop |
| `src/lib/localInferenceClient.js` | Local generation, talks to the bundled sd.cpp engine or a Wan2GP server |
| `src/lib/models.js` | Hosted catalog, generated from `models_dump.json` |
| `src/lib/localModels.js` | Local catalog, mirrors `electron/lib/modelCatalog.js` |
| `src/lib/promptUtils.js` | Prompt helpers |
| `src/lib/pendingJobs.js` | Tracks in-flight generation jobs |

The API key is stored in `localStorage` on the client side, which is worth
knowing if anyone plans to deploy the hosted version anywhere multi-user.

## Model families present in the catalog

Spot-checking the merged catalog, the hosted set spans the major commercial
video and image families: Veo (3, 3 Fast, 4), Kling, Sora, Grok Imagine, Gemini
Omni, Seedance, Hailuo/MiniMax, Wan, Flux, Nano Banana, Higgsfield's own Soul and
DoP models, plus a long tail of smaller providers. Availability and pricing are
muapi's, not any of these vendors' direct APIs, so quotas and terms come from
muapi rather than from Google, OpenAI, or ByteDance directly.
