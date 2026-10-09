# JARVIS on your Mac: operations

This is the runbook for the local agent in `perspective-engine/jarvis/agent`. Setup (Node, Ollama, the browser, the microphone) is in [JARVIS_SETUP.md](JARVIS_SETUP.md). Everything here was taken from the code. Steps marked *(untested on macOS)* use macOS programs (`open`, `osascript`, `say`, the Keychain, launchd). The agent was built and tested in a Linux container, so these steps are covered by argument and policy tests only.

All commands run from `perspective-engine/jarvis`.

## 1. Start, stop, token, health check

| What | Command |
|---|---|
| Start (foreground) | `npm run jarvis` |
| Start with a `.env` file | `npm run jarvis:env` (reads `jarvis/.env`; variable names are in `.env.example`) |
| Stop | `npm run jarvis -- stop` (sends SIGTERM to the pid in `~/.jarvis/agent.pid`), or Ctrl-C in the agent's terminal |
| Copy the token | `npm run jarvis -- token \| pbcopy` |
| Health check | `npm run jarvis -- doctor` |

- The agent listens on `127.0.0.1` only. If `JARVIS_HOST` is set to any other value, the agent stops at startup. The port is `JARVIS_PORT`, then `port` in `config.json`, then 7777.
- The token comes from `JARVIS_TOKEN` if set (at least 24 characters). Otherwise the agent generates it once into `~/.jarvis/token` with mode 0600. The agent never prints the token at startup.
- **Rotate the token:** stop the agent, delete `~/.jarvis/token`, start it again, and paste the new token into the console. The console keeps the token in `sessionStorage` only, so closing the tab forgets it.
- `doctor` checks the following: Node 20 or newer; macOS; that `~/.jarvis` is 0700 and the token file is 0600; that the project record is readable; Ollama and the recommended model size; the Anthropic key; the `claude` CLI; `playwright-core`; `say` and `osascript`.

## 2. Files in `~/.jarvis` (or `JARVIS_HOME`)

| File | Contents | Edit by hand? |
|---|---|---|
| `config.json` | Roots, models, voice, policy, browser and reminder settings. The agent writes the defaults on first start. | Yes. Restart the agent afterwards. |
| `token` | The bearer token (0600) | Delete it to rotate |
| `tasks.json` | Every task with its status, actions, pending confirmation and result | No (use the console or API) |
| `memory.jsonl` | Long-term memory, one JSON item per line | Only with the agent stopped (section 8) |
| `audit.jsonl` | Every tool call and every refused request, redacted | No. Append-only. |
| `reminders.json` | Reminders and their delivery state | No (use the console or API) |
| `session.json` | When you last asked, for "what changed since last time" | No |
| `agent.pid` | Pid of the running agent | Deleted at stop |
| `backups/` | Copy of every file before `fs.overwrite` replaces it | Clean up when you like |
| `trash/` | Files that `fs.delete` removed | Clean up when you like |

## 3. Configure (`~/.jarvis/config.json`)

```json
{
  "roots": ["/Users/you/High-Properties/perspective-engine"],
  "projectRoots": ["/Users/you/High-Properties/perspective-engine"],
  "peStatePath": "/Users/you/High-Properties/perspective-engine/city/public/state.json",
  "port": 7777,
  "models": { "ollamaHost": "http://127.0.0.1:11434", "ollamaModel": "qwen3:14b", "anthropicModel": "claude-opus-5-5", "claudeCode": true, "localOnly": false },
  "voice": { "say": true, "voice": "Daniel", "rate": 190 },
  "policy": { "preApproved": [], "denied": [] },
  "browser": { "headless": true, "downloadDir": "/Users/you/Downloads/jarvis" },
  "reminders": { "intervalMs": 15000 }
}
```

The loader rejects bad values and falls back to the defaults, so a typo can never widen access:
- Paths must be absolute (`~/` is expanded). Relative paths are ignored.
- The port must be an integer from 0 to 65535.
- `voice.rate` must be between 80 and 400.
- `reminders.intervalMs` must be at least 1000.

These environment variables override the file: `JARVIS_PORT`, `JARVIS_PE_STATE`, `OLLAMA_HOST`, `JARVIS_OLLAMA_MODEL`, `JARVIS_ANTHROPIC_MODEL`, `JARVIS_CLAUDE_CODE=0`, `JARVIS_LOCAL_ONLY=1`, `JARVIS_BROWSER_HEADLESS=0`, `JARVIS_SAY=0`.

### Models

The agent uses only the providers it can find:

| Provider | When it is used |
|---|---|
| `ollama` | Ollama answers at `ollamaHost` and has a model installed |
| `anthropic` | `ANTHROPIC_API_KEY` is set |
| `claude-code` | The `claude` CLI is on PATH and `claudeCode` is not false |
| `rules` | Always available as the fallback |

The `claude-code` provider calls the CLI as `claude -p` with `--tools Read,Grep,Glob --allowedTools Read,Grep,Glob --permission-mode dontAsk --strict-mcp-config --no-session-persistence`.

Each kind of request tries the providers in this order (`AGENT_ROUTES` in `agent/src/models.ts`):

| Kind | Order |
|---|---|
| classify | ollama-small, rules |
| conversation | ollama, anthropic, claude-code, rules |
| tool_planning | ollama, anthropic, claude-code, rules |
| research | anthropic, claude-code, ollama, rules |
| sensitive | ollama, ollama-small, rules (never leaves the Mac) |

- `localOnly: true` (or `JARVIS_LOCAL_ONLY=1`) sends every open question only to Ollama and the rules.
- Ollama models are detected through `/api/tags`, and the agent never pulls a model. Without `ollamaModel`, the agent picks the best installed model for the Mac's memory: up to 16 GB a 7-8B model (`qwen3:8b`, `llama3.1:8b`); up to 63 GB a 14B model (`qwen3:14b`, `phi4:14b`); 64 GB or more a 32B-class model (`qwen3:32b`, `qwen2.5:32b`). Pull a model yourself with `ollama pull <tag>`.
- Status, next, "needs me", reminders, decisions, the audit and navigation always get a deterministic answer from the record. They do not use a model.
- If no model is available, the console says so and the agent answers from the record only.

### Voice

- **In the console:** the browser's Web Speech API turns speech into text and `speechSynthesis` speaks the answers. Typing or speaking interrupts the reply (barge-in). The console shows a listening state and a speaking state.
- **On the Mac:** reminders run `notify`, and also `say` unless `voice.say` is false or `JARVIS_SAY=0`. `voice.voice` and `voice.rate` are passed to `say -v` and `-r` *(untested on macOS)*.

### Permissions (policy)

Each tool's risk level maps to an autonomy level in `jarvis/core/policy.ts`. Configuration cannot lower a level below its floor.

| Risk | Autonomy level | Behaviour for you (owner) |
|---|---|---|
| safe | 0 | Runs automatically |
| low | 1 | Runs automatically, within its scope (roots, allowlist) |
| medium | 2 | Asks for confirmation unless the tool id is in `policy.preApproved` |
| high, critical | 3 | Always asks for confirmation. Cannot be pre-approved. |

- `policy.denied: ["shell.run"]` turns a tool off completely.
- Tools with `requiresConfirmation: true` always ask, whatever the level.
- An unknown risk level fails closed to level 3.
- Every tool here has scope `owner`, so a visitor can never run one.

## 4. Tool catalogue

These are registered in `agent/src/app.ts`, from `agent/src/tools/*.ts`. `GET /api/tools` returns the same list with the live level of each tool.

| Id | What it does | Risk | Level | Timeout |
|---|---|---|---|---|
| `fs.list` | List a folder inside `roots` (depth 0-3) | safe | 0 | 10 s |
| `fs.read` | Read a text file inside `roots` | safe | 0 | 10 s |
| `fs.search` | Search file contents inside `roots` | safe | 0 | 30 s |
| `fs.write` | Create a new file, or append to one, inside `projectRoots`. Never replaces content. | low | 1 | 10 s |
| `fs.overwrite` | Replace a whole file (a backup goes to `~/.jarvis/backups`) | high, always asks | 3 | 10 s |
| `fs.delete` | Delete one file (moved to `~/.jarvis/trash`) | high, always asks | 3 | 10 s |
| `shell.run` | Run one allowlisted command with `execFile`, never through a shell | low | 1 | 320 s (each command has its own limit) |
| `open.url` | Open an http(s) URL with macOS `open` *(untested on macOS)* | low | 1 | 10 s |
| `notify` | Show a macOS notification with `osascript`. The text is passed as escaped arguments. *(untested on macOS)* | low | 1 | 10 s |
| `say` | Speak text with macOS `say`. The text goes in on stdin. *(untested on macOS)* | low | 1 | 60 s |
| `research.search` | DuckDuckGo HTML results (title, URL, snippet), labelled as external, untrusted content | safe | 0 | 20 s |
| `browser.open` | Load a public page and return an accessibility-style snapshot | safe | 0 | 45 s |
| `browser.read` | Snapshot the current page again | safe | 0 | 20 s |
| `browser.click` | Click an element on the page | medium | 2 | 45 s |
| `browser.type` | Type into a field | medium | 2 | 45 s |
| `browser.extract` | Extract links, headings, tables or text | safe | 0 | 20 s |
| `browser.download` | Download a public file to `browser.downloadDir` | low | 1 | 300 s |
| `browser.close` | Close the agent browser | safe | 0 | 15 s |

**Allowlisted commands for `shell.run`** (`COMMAND_RULES` in `agent/src/tools/shell.ts`). Pass `program` and `args` as separate strings.

| Rule | Allowed command |
|---|---|
| npm-test | `npm test` |
| npm-build | `npm run build` |
| npm-typecheck | `npm run typecheck` |
| git-status | `git status`, with listed flags and paths |
| git-log | `git log`, with listed flags, revisions and paths |
| git-diff | `git diff`, with listed flags, revisions and paths. `--no-ext-diff --no-textconv` is always added. |
| graph-status, graph-ready, graph-human, graph-export | `python3 tools/graph.py status\|ready\|human\|export`, run in the PE repo with no extra arguments |
| ls | `ls`, with letter flags and paths inside `roots` |

- Anything else is refused and recorded in the audit, including other programs, other subcommands, unknown flags, paths outside the roots and option-like paths.
- Shell metacharacters are passed to the program as literal text. They are never interpreted.

**Limits on files and the network:**
- Every path is resolved with `realpath`, symlinks included, before it is checked against the roots. `..` and links that point outside the roots are refused.
- Every fetch the agent starts itself (research, browser navigation and downloads) refuses the following: non-http(s) schemes; loopback, private, link-local, CGNAT, multicast and reserved addresses; cloud metadata addresses. This covers IPv4, IPv6 and IPv4-mapped addresses. The check runs after DNS resolution and again on every redirect.
- `open.url` only hands an http(s) URL without embedded credentials to your own browser. The agent does not fetch the page itself.

## 5. Add a tool

1. Create a `JarvisTool` (from `jarvis/core/types.ts`) in a new file under `agent/src/tools/`. It needs:
   - `id` (a dotted name)
   - `name` and `description`
   - a JSON `schema`
   - `riskLevel` (anything destructive is `high`, with `requiresConfirmation: true`)
   - `scope: 'owner'`
   - `timeoutMs`
   - `execute(input, ctx)`, which returns `{ ok, summary, data?, error? }`

   Validate every input inside `execute`. Use `resolveInside` from `agent/src/fsguard.ts` for paths, `safeFetch` and `checkUrl` from `agent/src/net.ts` for the network, and the `runner` from `agent/src/exec.ts` (it uses `execFile`) for programs. Never build a shell string.
2. Add it to `allTools` in `agent/src/app.ts`. A test can pass it through `createApp({ extraTools: [...] })` instead.
3. Add tests to `agent/tests/tools.test.ts`: the policy decision, refused inputs, and a run with a fake `runner`.
4. Run `npm test && npx tsc --noEmit`.

The registry (`createRegistry` in `jarvis/core/tools.ts`) applies the policy, the timeout and the audit to every call. A tool cannot skip them.

## 6. Add an application (context provider)

The briefing and the deterministic answers read the PE record through one context provider: `peContextFor` in `agent/src/briefing.ts`, built on `peContext` in `jarvis/core/adapters/perspective-engine.ts`. To add another application:

1. Write an adapter that turns its exported state into a `JarvisContext`, following the PE adapter. A `JarvisContext` has `applicationId`, `applicationName`, `environment`, `viewer`, `projectState: { completed, in_progress, blocked, waiting_for_user, next, risks }`, `relevantLinks` and `currentTasks`. Read a file the application exports; do not read its database.
2. Give it its own path setting in `config.ts`, following `peStatePath` (an absolute path with an env override).
3. Merge its `projectState` into `statusBriefing` in `agent/src/briefing.ts`, or give it its own intent in `agent/src/ask.ts`.
4. Test the adapter against a real exported file, as `server.test.ts` does with `city/public/state.json`.

The contract types in `jarvis/core/types.ts` are fixed. You may add optional fields, but you may not change existing ones.

## 7. Inspect tasks, confirmations and the audit

- **In the console:** the task list shows every task. A task in `waiting_for_user` has Confirm and Cancel buttons. The audit feed shows the latest entries.
- **Through the API:** send `Authorization: Bearer $(npm run -s jarvis -- token)`. Requests without an `Origin` header (curl) are accepted. The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`.

  ```sh
  T=$(npm run -s jarvis -- token)
  curl -s -H "Authorization: Bearer $T" http://127.0.0.1:7777/api/status
  curl -s -H "Authorization: Bearer $T" http://127.0.0.1:7777/api/tasks
  curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:7777/api/audit?limit=50"
  curl -s -H "Authorization: Bearer $T" -H 'content-type: application/json' \
       -d '{"text":"what needs me?"}' http://127.0.0.1:7777/api/ask
  curl -s -H "Authorization: Bearer $T" -H 'content-type: application/json' \
       -d '{"input":{"program":"git","args":["status","--short"]},"confirmed":false}' http://127.0.0.1:7777/api/tools/shell.run
  curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{}' http://127.0.0.1:7777/api/tasks/<id>/confirm
  ```

- **Other routes:**
  - `GET /api/tools`
  - `GET /api/memory?q=&k=&kind=` and `POST /api/memory {kind, text, reason?}`
  - `GET /api/reminders` and `POST /api/reminders {text, dueAt?}`
  - `POST /api/reminders/<id>/dismiss`
  - `POST /api/tasks/<id>/cancel`
- **Request bodies:** POST bodies must be `application/json`.
- **Error codes:**

  | Code | Meaning |
  |---|---|
  | 401 | Missing or wrong token (compared in constant time) |
  | 403 | Wrong `Host`, a foreign `Origin`, or `sec-fetch-site: cross-site` |
  | 415 | The body is not JSON |

- **Tool results:** a tool call returns `decision`, one of `auto`, `confirmed`, `needs_confirmation` or `denied`, together with the task it created.
- **On disk:** each line of `audit.jsonl` holds `at, actor, task, tool, inputSummary, resultSummary, risk, decision, ok, durationMs`. Keys, tokens and passwords are redacted before the line is written. Read it with `tail -f ~/.jarvis/audit.jsonl`.

## 8. Update memory and the knowledge index

- **Memory** lives in `memory.jsonl`. Item kinds are `episodic`, `decision`, `preference`, `project` and `working`.
  - **Add an item:** say "remember that ..." or "I decided ... because ...", or use `POST /api/memory`. Text that looks like a credential is refused.
  - **Search:** `GET /api/memory?q=`. Search is keyword overlap, newest first. There are no embeddings.
  - **Correct or remove an item:** stop the agent and edit or delete its line in `memory.jsonl`, or append `{"id":"<id>","deleted":true}`. Then start the agent again. The file is loaded at startup.
- **The project knowledge** is the PE record, `city/public/state.json`. Regenerate it with `python3 tools/graph.py export` from the PE repo, or ask Jarvis to run `graph-export` through `shell.run`. The agent re-reads the file whenever its modification time changes, so no restart is needed. Point `JARVIS_PE_STATE` at another export to brief from it.

## 9. Debug

| Symptom | Check |
|---|---|
| The console says 401 | Paste the token again: `npm run jarvis -- token \| pbcopy`. `sessionStorage` is cleared when the tab closes. |
| 403 | Open the console as `http://127.0.0.1:7777/` or `http://localhost:7777/`, not through another host name or a proxy |
| "port in use" at startup | `lsof -i :7777`, then stop the other process or set `JARVIS_PORT` |
| Briefing says the record is unavailable | `npm run jarvis -- doctor` shows the path and the error. Run `python3 tools/graph.py export`. |
| No model answers | `doctor`. `ollama list` must show a model, `ANTHROPIC_API_KEY` must be exported in the agent's shell, or `claude` must be on PATH. |
| Browser tools say playwright is missing | `npm install` (playwright-core is a devDependency), then `npx playwright-core install chromium` |
| A command is refused | Read the reason in the result or in `audit.jsonl`. Only the rules in section 4 run. Extend `COMMAND_RULES` and its tests if you need another one. |
| Reminders do not appear *(untested on macOS)* | Allow notifications for "Script Editor"/osascript under System Settings > Notifications. Check `lastError` in `reminders.json`. |
| Voice input does nothing | Use Chrome or Safari on `127.0.0.1`, and grant the microphone to the browser (JARVIS_SETUP.md, step 5) |

Before you change agent code, run `npm test` and `npx tsc --noEmit`. `npm run agent:test` runs only the agent tests.
