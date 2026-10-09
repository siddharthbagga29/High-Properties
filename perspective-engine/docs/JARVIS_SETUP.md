# JARVIS on your Mac: setup

This sets up the private Jarvis agent: a small Node server on your Mac that listens on `127.0.0.1` only, needs a token, and serves a local console with voice at `http://127.0.0.1:7777/`. Day-to-day use (configuration, tools, permissions, debugging) is in `docs/JARVIS_OPERATIONS.md`. The design is in `docs/JARVIS_ARCHITECTURE.md`.

> **Status, honestly.** The agent was built and tested in a Linux container (171 agent tests, real HTTP server, real Chromium). It has **not yet been run on macOS**. Everything Mac-specific (`say`, `osascript` notifications, `open`, the microphone prompt, Keychain, LaunchAgent) is implemented and covered by argument-level tests only. Steps marked *(untested on macOS)* are the expected path; tell Jarvis's maintainers if any of them differ on your machine.

Only steps 1 to 4 are required. Everything after that is optional.

---

## 1. Requirements

| Need | Check | Get it |
|---|---|---|
| macOS (a recent version) | Apple menu → About This Mac | |
| Node.js 20 or newer (22 recommended) | `node -v` | installer from nodejs.org, or `brew install node@22` |
| git and Python 3 (for the project graph commands) | `git --version`, `python3 --version` | `xcode-select --install` |
| The repository | | `git clone https://github.com/siddharthbagga29/High-Properties.git` |

Everything below runs in `High-Properties/perspective-engine/jarvis`.

## 2. Install and test

```bash
cd High-Properties/perspective-engine/jarvis
npm install
npm test            # core + agent, all must pass
npx tsc --noEmit    # typecheck, must print nothing
```

`npm run agent:test` runs only the agent's tests.

## 3. Start the agent

```bash
npm run jarvis
```

It prints the console address, where the token lives, which project record it reads and which language models it found, then keeps running in this terminal. The token is never printed on start.

| Command | What it does |
|---|---|
| `npm run jarvis` | start (foreground; Ctrl-C stops it) |
| `npm run jarvis -- stop` | stop a running agent from another terminal (SIGTERM to the pid in `~/.jarvis/agent.pid`) |
| `npm run jarvis -- token` | print the token (only when you ask) |
| `npm run jarvis -- doctor` | check Node, macOS, file permissions, the project record, Ollama, the API key, the `claude` CLI, playwright-core, `say`, `osascript` |
| `npm run jarvis:env` | start with settings from `jarvis/.env` (copy `.env.example`; needs Node 20.6+) |

The agent refuses to listen anywhere except `127.0.0.1` (setting `JARVIS_HOST` to anything else stops it). Change the port with `JARVIS_PORT=7788 npm run jarvis`.

## 4. Open the console and paste the token

1. Copy the token: `npm run -s jarvis -- token | pbcopy`
2. Open **http://127.0.0.1:7777/** in Chrome or Safari. Use exactly `127.0.0.1` or `localhost` with the port: any other host name is refused (that is the DNS-rebinding guard).
3. Paste the token once. The console keeps it only in this tab's `sessionStorage`; it is gone when the tab closes, and **Lock** forgets it immediately.

You should see the briefing (Online · Currently · Completed · Needs you · Next) computed from `perspective-engine/city/public/state.json`. Type "where are we" to check.

The token file is `~/.jarvis/token` (mode 0600, created on first start). To use your own token instead, set `JARVIS_TOKEN` (24 characters or more). To rotate it: stop the agent, delete `~/.jarvis/token`, start again, paste the new one.

## 5. Microphone and voice *(untested on macOS)*

Speech **output** works without any permission: the console speaks with the browser's `speechSynthesis`, and reminders use macOS `say`.

Speech **input** uses the browser's Web Speech API, which works on `127.0.0.1` because it counts as a secure context:

1. Click the orb (the round microphone button) in the console. The browser asks for the microphone: allow it for `127.0.0.1`.
2. If nothing happens, allow the browser itself: **System Settings → Privacy & Security → Microphone →** turn on Google Chrome (or Safari).
3. In Safari, also check **Safari → Settings → Websites → Microphone** for `127.0.0.1`.

What you will see: the orb glows cyan while listening and violet while Jarvis speaks. Starting to talk, typing in the box, or pressing Escape stops Jarvis mid-sentence (barge-in). **Hands-free** keeps listening between turns.

Privacy note: Chrome's recogniser sends audio to Google's servers; Safari uses Apple's speech recognition. For speech that never leaves the Mac, see step 9.

Notifications: reminders are shown with `osascript` (`display notification`). macOS attributes these to **Script Editor**; if none appear, allow notifications for Script Editor in **System Settings → Notifications**.

## 6. Optional: language models

Without any model, Jarvis answers everything that the project record can answer (status, next, what needs you, reminders, decisions, explanations of tasks) and says plainly that open questions need a model. Models are tried in this order for open questions: **Ollama (on this Mac) → Anthropic API → `claude` CLI → rules**. Set `JARVIS_LOCAL_ONLY=1` to keep every question on the Mac.

### Ollama (local, private)

1. Install from ollama.com (or `brew install ollama`) and start it (the app, or `ollama serve`).
2. Check your memory: `echo $(( $(sysctl -n hw.memsize) / 1073741824 )) GB`
3. Pull one model yourself. Jarvis never downloads a model.

| Memory | Size class | Pull one of |
|---|---|---|
| up to 16 GB | 7-8B | `ollama pull qwen3:8b` or `ollama pull llama3.1:8b` |
| 18 to 63 GB (e.g. 32 GB) | 14B | `ollama pull qwen3:14b` or `ollama pull phi4:14b` |
| 64 GB or more | 32B class | `ollama pull qwen3:32b` or `ollama pull qwen2.5:32b` |

`npm run jarvis -- doctor` prints the recommendation for your Mac. Jarvis finds installed models through `http://127.0.0.1:11434/api/tags` and picks the largest one that fits the recommended class; pin one with `JARVIS_OLLAMA_MODEL=qwen3:14b` or `models.ollamaModel` in `~/.jarvis/config.json`. These tags are suggestions; any chat model Ollama lists works.

### Anthropic API (keep the key in the Keychain)

Store the key once (the command prompts for it, so it never lands in your shell history):

```bash
security add-generic-password -a "$USER" -s jarvis-anthropic-api-key -w
```

Then start Jarvis with the key exported from the Keychain for that process only:

```bash
ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s jarvis-anthropic-api-key -w)" npm run jarvis
```

Never write the key into `.env` or `config.json`. The agent strips it (and `JARVIS_TOKEN`) from the environment of every program it starts, and redacts key-like text from the audit log, tasks, reminders and memory it writes to disk. (One deliberate exception: a tool call waiting for your confirmation keeps its exact input in `tasks.json` until it runs or is cancelled, so that Confirm runs precisely what you saw.)

### Claude Code CLI

If `claude` is on your PATH and signed in, Jarvis can use it for open questions: headless (`-p`), with only the read-only tools Read, Grep and Glob, `--permission-mode dontAsk`, no MCP servers, no saved session, working directory `perspective-engine/`. It never uses `--dangerously-skip-permissions`. Turn it off with `JARVIS_CLAUDE_CODE=0`.

## 7. Optional: browser tools

`npm install` already installed `playwright-core`. Download its browser once:

```bash
npx playwright-core install chromium
```

This fetches the Chromium build that matches the installed playwright-core version (about 150 MB, into `~/Library/Caches/ms-playwright`). To use your installed Google Chrome instead, set `"browser": { "channel": "chrome" }` in `~/.jarvis/config.json`. The agent's browser has no profile and no saved logins; all its traffic goes through Jarvis's network guard, which refuses private, loopback, link-local and cloud-metadata addresses for every request, redirect and sub-request. Downloads go to `~/Downloads/jarvis`. Set `JARVIS_BROWSER_HEADLESS=0` to watch the browser.

## 8. Optional: run in the background *(untested on macOS)*

Simplest: `nohup npm run jarvis >> ~/.jarvis/agent.log 2>&1 &` and stop it with `npm run jarvis -- stop`.

To start at login, a LaunchAgent (replace the two paths; `which npm` shows yours):

```xml
<!-- ~/Library/LaunchAgents/com.perspective-engine.jarvis.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.perspective-engine.jarvis</string>
  <key>WorkingDirectory</key><string>/Users/YOU/High-Properties/perspective-engine/jarvis</string>
  <key>ProgramArguments</key><array><string>/opt/homebrew/bin/npm</string><string>run</string><string>jarvis</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/.jarvis/agent.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/.jarvis/agent.log</string>
</dict>
</plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.perspective-engine.jarvis.plist   # start now and at login
launchctl bootout gui/$(id -u)/com.perspective-engine.jarvis                                     # stop and unload
```

A LaunchAgent does not see your Keychain export from step 6; if you need the Anthropic API in the background, start Jarvis from a terminal instead, or use Ollama.

## 9. Optional: offline speech recognition (whisper.cpp)

**CAPABILITY GAP:** the console listens through the browser's Web Speech API. A local recogniser is not wired into the agent yet. **IMPLEMENTATION REQUIRED:** record audio in the console (MediaRecorder), post it to a new token-protected `/api/transcribe` endpoint, run `whisper-cli` on it with `execFile`, and return the text.

What works offline today: **macOS Dictation** in the console's text box (System Settings → Keyboard → Dictation; on Apple silicon it runs on the device for supported languages), then press Enter.

To prepare whisper.cpp for when the endpoint exists *(untested on macOS)*:

```bash
brew install whisper-cpp                         # provides the whisper-cli command
mkdir -p ~/.jarvis/models
curl -L -o ~/.jarvis/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
whisper-cli -m ~/.jarvis/models/ggml-base.en.bin -f some-recording.wav   # 16 kHz WAV
```

## 10. Check that everything works

1. `npm run jarvis -- doctor`: Node, macOS, private folder and project record show `ok`.
2. Console: the briefing appears; "where are we" answers with the same counts as the city.
3. "remind me in 1 minute to stretch": within a minute you get a notification and hear it; the reminder moves to delivered.
4. "search the web for Perspective Engine": results appear, labelled external.
5. Tasks show each action; anything risky waits for **Confirm**. The audit feed lists every tool call.

## 11. If something is wrong

| Symptom | Cause and fix |
|---|---|
| Console asks for the token again | The tab was closed or locked; paste it again (`npm run -s jarvis -- token \| pbcopy`). |
| `401 unauthorized` from curl | Send `Authorization: Bearer <token>`. |
| `403 forbidden_host` | Use `http://127.0.0.1:7777` or `http://localhost:7777` exactly. |
| `403 forbidden_origin` | Another site or a file page tried to call the agent; only the console itself may. |
| `EADDRINUSE` on start | Something already uses port 7777: `JARVIS_PORT=7788 npm run jarvis`. |
| "notify needs macOS" | You are not on a Mac; reminders stay under Needs you instead of being claimed as delivered. |
| Microphone blocked | Step 5; the console names the exact setting. |
| "No language model is available" | Expected without Ollama, an API key or `claude`; see step 6. |

More in `docs/JARVIS_OPERATIONS.md` (Debugging).
