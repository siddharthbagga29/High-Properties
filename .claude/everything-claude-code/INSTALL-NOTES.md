# everything-claude-code: what was installed and what was not

Vendored from https://github.com/WorldFlowAI/everything-claude-code
(checked out 2026-08-29).

## Active (auto-loads in every session)

| Where | Count | What |
|---|---|---|
| `.claude/skills/` | 11 | Skills, auto-discovered by name and description |
| `.claude/agents/` | 9 | Subagents, callable via the Agent tool |
| `.claude/commands/` | 15 | Slash commands |

## Inert (vendored here, not wired up)

| Path | Why it is not active |
|---|---|
| `hooks/` | Hooks run shell on Claude Code lifecycle events. Activating them means editing `settings.json`, which is a deliberate opt-in, not something to inherit silently from a third-party repo. |
| `rules/` | Meant to be pasted or imported into a `CLAUDE.md`. This project has no `CLAUDE.md` yet. |
| `contexts/` | Context presets (dev / research / review) the upstream project loads manually. |
| `mcp-configs/` | Example MCP server definitions. Wiring MCP servers is a per-machine decision. |

## Two things were renamed to avoid shadowing built-ins

Claude Code ships built-in skills. A project skill with the same name silently
shadows the built-in, which is why the design-skills README in this repo already
omits `skill-creator` for the same reason.

| Upstream | Installed as | Shadowed built-in |
|---|---|---|
| skill `security-review` | `security-review-checklist` | built-in `security-review` |
| command `code-review.md` | `ecc-code-review.md` | built-in `code-review` skill |

Both keep their full original content. Only the identifier changed, and the
`name:` field inside the renamed skill was updated to match its directory.

## Three skills shipped without valid frontmatter

Claude Code requires YAML frontmatter with `name` and `description` for a skill
to load at all. These three had none and would have been silently ignored:

- `eval-harness`
- `verification-loop`
- `project-guidelines-example`

Frontmatter was written for each, derived from the body content. The bodies are
unmodified. If you re-pull upstream, this fix must be reapplied.

## To activate the hooks later

Read `hooks/hooks.json` and the scripts first. The two skill-bundled scripts
(`continuous-learning/evaluate-session.sh`, `strategic-compact/suggest-compact.sh`)
were reviewed at install time: they read the transcript path, count messages, and
write advisory lines to stderr. No network calls, no destructive operations. The
four scripts under `hooks/` were vendored but not audited line by line, so review
them before wiring anything into `settings.json`.
