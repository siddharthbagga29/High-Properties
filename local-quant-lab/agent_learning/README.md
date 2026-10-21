# agent_learning — project skills and memory schema

| Path | What |
|---|---|
| `candidate_skills/<name>/` | Proposed skill: `SKILL.md` (front matter `name`, `description`, `version`; sections Intended use, Prohibited use, Procedure, Evidence, Rollback) + `policy.json` |
| `regression/experiment_triage_cases.json` | Frozen regression set (success, failure, unsafe, prior-failure cases). `must: true` cases must all pass. |
| `regression/FROZEN.sha256` | Pin; evaluation refuses to run if the cases change. To change the set: add a new versioned file, record a decision in docs/DECISIONS.md, re-pin. |
| `approved_skills/<name>/<version>/` + `registry.json` | Promoted versions; `current` and history with `rollback_to` |
| `rejected_skills/<name>-<version>/rejection.json` | Rejected candidates and why (kept, never deleted) |
| `evaluations.jsonl` | Append-only log of promote / reject / rollback decisions with scores and the diff |

`policy.json` schema (kind `experiment_triage`): `min_round_trips` int ≥ 10, `reject_if_test_return_le` number ≥ 0,
`flag_fragile` bool, `flag_synthetic` must be `true`. Unknown keys are rejected.

Project memory summary format (for Hermes or any assistant): one fact per line, `[verified|assumption|hypothesis|
preference|failed] <fact> — <evidence path>`. Authoritative facts stay in the repo docs; Hermes private memory is never
exported.

Commands: `python3 -m lql.cli skills propose <dir>` · `skills status` · `skills rollback <name> --by <you>`.
