# Proactive assistant pilot runbook

For the 2 to 3 person pilot in [the plan](PROACTIVE_ASSISTANT_PLAN.md), section 11. The pilot runs on one Windows machine.

## One-time setup

1. `uv sync`, `pnpm install`, `pnpm build`.
2. In `.env`:
   - `APP_URL=https://<your reserved ngrok domain>` and `NGROK_DOMAIN=<the same domain, without https://>`
   - The Google Chat settings from [GOOGLE_CHAT.md](GOOGLE_CHAT.md)
   - `ORG_TIMEZONE`, `CHECKIN_HOUR`, `CHECKIN_MAX_ITEMS`, `UNDO_WINDOW_MINUTES` (the defaults are fine)
   - Optionally `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` for Groq extraction. Without them, the deterministic parser is used.
   - Keep `PROACTIVE_ENABLED=false` and `PROACTIVE_DRY_RUN=true` for now.
3. Install ngrok and sign in once (`ngrok config add-authtoken ...`). `scripts/pilot.ps1` uses `ngrok http --url=...`,
   which needs ngrok 3.16 or later. On older versions, change `--url=https://` to `--domain=`.
4. Register the startup task, so the backend and the tunnel start at logon and come back after a crash or a reboot:
   `powershell -ExecutionPolicy Bypass -File scripts/register-pilot-task.ps1`, then
   `Start-ScheduledTask -TaskName 'TeamPulse pilot'`. Logs are in `data/logs/`.
5. Check that `https://<domain>/api/health` answers, that each pilot user has messaged the Chat app, and that
   Settings shows Google Chat as connected for each of them.

Run one backend process only: no `--workers`. `scripts/pilot.ps1` does this. The unique constraint on check-ins
prevents a duplicate check-in even if two processes run, but replies and outbox sending assume one.

## Before the first day

- Back up the database: `./scripts/backup.ps1` (SQLite). On PostgreSQL, take a `pg_dump`.
- Confirm in-app that a link pasted with a commitment selected appears under that commitment's Files & links tab.
- Send a screenshot to the Chat app with "1 is 90%" in reply to a check-in, then open it from TeamPulse as the
  manager. If Open returns "Google Chat did not return this file", the app's credentials can't download attachments
  (plan 9.1). Tell pilot users to share files from Drive instead.

## Dry-run day

1. Set `PROACTIVE_ENABLED=true` (keep `PROACTIVE_DRY_RUN=true`) and restart the task.
2. After the check-in hour, open Settings as an administrator and read the **Check-in preview** for today: who
   got a check-in, which items, and the composed message. In dry run, Chat delivery shows `Skipped`. Check-ins
   also appear in each person's AI chat, where they can reply as normal.
3. If anything looks wrong, set `PROACTIVE_ENABLED=false`. Nothing is sent from the next tick on.

## Going live

Set `PROACTIVE_DRY_RUN=false` and restart. From the next weekday at `CHECKIN_HOUR`, each opted-in person with
something that needs their word gets one Google Chat DM a day. People can say `pause`, `resume`, `undo` or `help`,
or change it in Settings → Check-ins.

## Privacy and logs

Message text and model output are never logged. Logs hold ids, counts and timings only. Every automatic
change has an audit event (`Updated by the assistant from ...'s check-in reply`) and a conversation trail, and
`undo` reverses the last automatic update for two hours.
