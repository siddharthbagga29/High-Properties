# Hermes Integration — Local Quant Lab

Source of truth for how Hermes Agent fits into this project. These facts come from the official repository docs (`NousResearch/hermes-agent`, shallow clone dated 2026-10-20, MIT licence). Re-check them after any Hermes upgrade.

## Role
- **What Hermes does:** acts as an *advisor*. It can do memory and cross-session recall, research planning, failure diagnosis, summaries, and candidate skill drafting.
- **What Hermes cannot touch:** the signal-to-order path, the risk engine, the ledger, `config/settings.json`, task verification, and anything involving a broker.
  - This is enforced in code. `lql/agents/hermes_adapter.py` imports nothing from risk, execution or config, and a test asserts that with an AST check.
- **When Hermes is missing, slow or wrong:** the deterministic fallback runs, and `hermes_unavailable` and `fallback_used` events are logged. The app's tests do not depend on Hermes.

## Integration surface (smallest documented one)
| Purpose | Command | Doc |
|---|---|---|
| Health | `hermes --version` | CLI reference |
| One bounded query | `hermes chat --query-file <file>` ("nothing is shell-interpreted") | `website/docs/user-guide/cli.md` |
| Isolated profile | `hermes -p <profile> chat …` (memory is per profile) | `user-guide/features/memory.md` |
| Memory status/setup | `hermes memory status`, `hermes memory setup` | `user-guide/features/memory.md`, `memory-providers.md` |

Adapter rules:
- The subprocess gets a minimal environment. Variables whose names look like keys, tokens, secrets, brokers or accounts are removed.
- Inputs are capped at 32 KB and outputs at 64 KB. Each task has a timeout.
- A non-blocking file lock enforces one writer per profile.
- Only the last JSON object in the output is read. It must match a strict schema with no extra fields. For example, strategies must be in the registry and parameters must be small integers. `trusted=False` is always set.

The task contract (`TaskContract`) has these fields:
- `task_id`
- `kind`: `propose_experiments` | `diagnose_failure` | `summarize`
- `goal`
- `inputs`
- `timeout_s`
- `retry_budget`
- `escalation`

## Runtime and model choice (to be run on the founder's MacBook Air M3)
This build ran in a Linux cloud container: CPU only, no GPU, not the Mac. Hermes was **not installed here** on purpose. A ≥64K-context local model on CPU would be impractically slow, and installing it here would not help the Mac (decision D-002).

Steps on the Mac. Every one is free; there are no subscriptions.
1. **Check the machine:** `python3 scripts/hermes_check.py`. It records macOS, chip, RAM, free disk, uv, Ollama and Hermes in `state/hermes_check.json`.
2. **Install Hermes from the official installer:** `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`. Read the script first if you prefer.
3. **Pick a local model:** run `hermes model`, then choose **Local models**.
   - The docs say Hermes picks a model for the hardware.
   - The docs also say "every recommended model gets at least a 64K context window" and that context starts at what fits memory.
   - On an M3 Air, RAM decides what fits. With 8 GB, expect only small models and slow long-context runs. 16–24 GB is comfortable for a small instruct model.
   - Check the size and licence that the picker shows before accepting a download.
   - Alternatively, use Ollama as a custom OpenAI-compatible `base_url` (see the docs' Ollama guide). You must then confirm the served context is really ≥64K.
4. **Do not** sign up for Nous Portal or add any hosted provider key. If no local model is fast enough, leave Hermes off. The app is fully functional without it.
5. **Memory:** run `hermes memory status`.
   - Built-in memory lives in `~/.hermes/memories/MEMORY.md` and `USER.md`, per profile.
   - Holographic (local SQLite) is optional, via `hermes memory setup`. Use it only if the installed version lists it. No cloud memory providers.
6. **Profile:** use a dedicated profile for this project, `hermes -p lql …`, and pass `profile="lql"` to `HermesAdapter`.
7. **Prove recall across sessions:** `python3 scripts/hermes_check.py --memory-roundtrip`. It writes a nonce in session 1 and recalls it in session 2.
8. **Try the bridge:** `python3 -m lql.cli hermes`. The `source` field should read `hermes`; otherwise the result shows the fallback reason.

## Memory tiers and bridge
- **Authoritative and portable:** the versioned repo files listed in `PROJECT_CONTEXT.md` §7, plus `state/current_state.json` and the audit events.
- **Hermes private memory** (`~/.hermes/...`) supplements those files and is **never exported**. The export excludes `MEMORY.md`, `USER.md` and anything under a `.hermes` directory.
- **Project skills:**
  - Live in `agent_learning/`.
  - `SKILL.md` uses Hermes-compatible front matter (`name`, `description`, `version`).
  - To use an approved skill in Hermes, copy `agent_learning/approved_skills/<name>/<version>/SKILL.md` to `~/.hermes/skills/<name>/SKILL.md`. Hermes skills live there per the docs. Copy by hand; this is a deliberate human step.

## Learning loop (measured, not assumed)
`candidate_skills/<name>` → `SkillLab.propose()` → safety gate + frozen regression set (`agent_learning/regression/`, SHA-256 pinned) → promoted to `approved_skills/<name>/<version>` with registry history, or copied to `rejected_skills/` with the reasons → `rollback` changes the registry only.

- **Safety gate:** forbidden patterns cover live orders, kill-switch or risk bypass, `settings.json`, raising limits, ignoring instructions, curl-pipe-shell, `rm -rf`, API keys, sudo, `done_verified`, and editing tests. The policy also has floors: at least 10 round trips, synthetic data always HOLD, and a losing test window always REJECT. Unknown policy keys are rejected.
- **Evidence so far (tests):**
  - v1.0.0 scored 12/12 and was promoted.
  - A loosened v1.1.0 was rejected for a lower score.
  - An unsafe text ("place_order on the live account"), turning off the synthetic flag, and adding an `execute_orders` key were each rejected.
  - Rollback 1.0.1 → 1.0.0 worked.
  - Editing the frozen set makes evaluation refuse.
- Hermes does not retrain model weights. "Learning" here means memory plus versioned, regression-tested procedures.
- `NousResearch/hermes-agent-self-evolution` is deferred because no LICENSE file was found (D-004).

## Troubleshooting
- **`hermes executable not found on PATH`:** open a new shell after installing, or add the installer's bin directory to PATH.
- **Every call times out:** the model is too slow for the context. Pick a smaller model, or leave Hermes off.
- **`invalid output discarded`:** the model did not return the JSON schema. That is expected sometimes; the fallback runs.
- **`profile lock`:** another Hermes call is running for the same profile. Wait; calls are refused rather than queued.

## Future (explicit opt-in only)
A paper broker adapter (`BROKER_PAPER`) is a design placeholder that raises `NotConnected`.

Before anyone writes one, the founder must approve:
- the broker
- that it is a paper-only account
- where the credentials live (environment variables, never git)
- broker-side limits matching `config/settings.json`

The same risk engine must stay in front of it. Live trading needs a separate review of broker agreements and market-access obligations (e.g. SEC Rule 15c3-5 for broker-dealers). It is out of scope for this build.
