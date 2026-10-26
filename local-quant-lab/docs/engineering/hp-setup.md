# HP setup brief: for the Claude Code session running on the HP

The founder's HP Envy (16 GB RAM, Windows 11, WSL2 Ubuntu, Linux user `siddb29`) becomes the always-on lab machine. The founder is a beginner at the terminal. Do the work yourself. Ask only for:
- a password;
- the Massive key;
- a Windows administrator click.

Explain each request in one plain sentence.

Rules for this brief:
- Never enable live trading or add a broker.
- Never install Hermes or any paid service.
- Never print or commit the key.
- Push code changes only after the tests pass.

1. **Toolchain and checks.**
   - Install git, Python 3.12+ and Node 22.
   - The repository is already in `~/HP-floor` (branch `claude/nice-fermat-510prv`). Read `local-quant-lab/docs/engineering/runbook.md` and `docs/DECISIONS.md` (D-022, D-023).
   - In `local-quant-lab`, run `make test`, `npm ci`, `npx playwright install --with-deps chromium`, `make ui-check` and `make runtime-check`. Report the real results.
2. **Key.**
   - Store the Massive API key in `~/.config/lql/massive.env` as `MASSIVE_API_KEY=...` with `chmod 600`, outside the repository. Have the founder paste it at a hidden prompt (`read -s`).
   - Run `scripts/daily_run.py --refresh-data` with that key and `LQL_MASSIVE_TERMS_OK=yes`, and show the summary.
3. **Re-verify the dividend adjustment** with the Yahoo Finance references the founder already checked on the Mac (Close:Adj Close). Each must print `split_and_dividend_adjusted`:
   ```
   python3 scripts/check_adjustment.py SPY --ref 2024-12-02:603.63:590.01 --ref 2025-01-02:584.64:573.38 --tol 0.003 --write
   python3 scripts/check_adjustment.py QQQ --ref 2024-12-02:515.29:510.13 --ref 2025-01-02:510.23:505.93 --tol 0.003 --write
   python3 scripts/check_adjustment.py IWM --ref 2024-12-02:241.75:236.75 --ref 2025-01-02:221.14:217.21 --tol 0.003 --write
   python3 scripts/check_adjustment.py TLT --ref 2024-12-02:93.87:86.50 --ref 2025-01-02:87.57:81.01 --tol 0.003 --write
   ```
   Then run `daily_run.py` and confirm the backtests report VERIFIED_HISTORICAL.
4. **Always on.**
   - Keep the control room (`make run`) running in WSL, restarting on login.
   - Schedule the daily pass at **7:00 AM US Eastern** with Windows Task Scheduler calling `wsl.exe`. The pass is `daily_run.py --refresh-data --forward`, loading the key from the env file.
   - Set the HP never to sleep while plugged in.
   - Run the task once to prove it works, and show where its log is.
   - After a `git pull`, the control room must be restarted. `daily_run.py` refuses a server running older code.
5. **One forward log only.** Give the founder the command to turn off the Mac's job: `launchctl unload ~/Library/LaunchAgents/com.localquantlab.daily.plist`. Tell them to run it only after the HP's first scheduled run has succeeded.
6. **Viewing from the Mac.**
   - Keep the dashboard bound to 127.0.0.1 and reach it from the Mac only through an SSH tunnel.
   - Propose Tailscale (free) or Windows OpenSSH on the home Wi-Fi, and wait for the founder's choice.
   - Never expose port 8765 to the network.
