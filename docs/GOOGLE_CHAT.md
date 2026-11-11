# Google Chat app

TeamPulse talks to people through a Google Chat app, in direct messages only.

- **People connect themselves.** Someone opens Google Chat, finds the TeamPulse app and sends it a message. Google tells TeamPulse their verified email. If it matches an active `@flodataanalytics.com` account, that DM becomes their TeamPulse channel. Settings shows "Connected".
- **Messages in.** Every DM goes through the same router as in-app chat (`services/proactive.py`): the commands
  `pause`, `resume`, `undo` and `help`; a `yes` or `no` to a pending change; a reply to an open check-in or manager
  request (which also updates the work); otherwise the assistant graph. Status, progress and completion of your own
  work save at once (`undo` reverses them for two hours). Date moves and blockers from a check-in are confirmed in
  the DM with `yes`; other proposals (new commitments, update requests) are confirmed in TeamPulse, and the reply
  includes the link.
- **Files.** A file or link sent with an update is recorded against the commitment it is about. If that can't be
  told, the app asks which item. TeamPulse stores a reference, not the file, and opens uploads by fetching them
  from the Chat API.
- **Messages out.** These are queued in `channel_outbox` and sent by the workflow tick, which runs every minute:
  - Update requests (they also stay in the TeamPulse inbox).
  - The daily check-in (weekdays, see the [pilot runbook](PILOT_RUNBOOK.md)), and planning nudges.
  - A manager's notice when someone confirms a moved date or a blocker.
  - Overdue and escalation notices.
  - Dependency requests.
  - Notices that someone replied to your request.
- **Privacy.** In shared spaces the app only says "message me directly". It never discusses anyone's work there.

The code is in `backend/app/channels/google_chat.py`, `backend/app/channels/delivery.py` and `backend/app/api/routes/integrations.py`. The tests are in `backend/tests/test_google_chat.py`.

## What you need to provide

| Value | Where it comes from | Goes into `.env` as |
| --- | --- | --- |
| Public HTTPS URL of TeamPulse | Your deployment, or a tunnel such as `cloudflared` or `ngrok` for local testing. Google must be able to reach it. | `APP_URL=https://teampulse.example.com` |
| Google Cloud **project number** | Cloud console, project dashboard (the number, not the ID) | `GOOGLE_CHAT_AUDIENCE=123456789012` |
| Service-account JSON key | Cloud console: IAM, Service accounts, Create, Keys, Add key, JSON | `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE=C:/secrets/teampulse-chat.json` |

Nothing else is required: no OAuth client and no domain-wide delegation. The app sends as itself with the `chat.bot` scope.

## One-time setup in Google Cloud (Workspace admin)

1. Create or choose a Google Cloud project in the `flodataanalytics.com` organization. Note its **project number**.
2. Enable the **Google Chat API**.
3. In **Google Chat API, Configuration**:
   - **App name:** TeamPulse. Add an avatar URL and a description.
   - **Interactive features:** on. Tick "Receive 1:1 messages". "Join spaces" is optional; the app only answers there with a privacy note.
   - **Connection settings:** HTTP endpoint URL `https://<your host>/api/integrations/google-chat/events`.
   - **Authentication audience:** Project number. Use the same number in `GOOGLE_CHAT_AUDIENCE`.

     If you choose "HTTP endpoint URL" instead, set `GOOGLE_CHAT_AUDIENCE` to that full URL. Both modes are supported.
   - **Visibility:** the people or groups in your domain who should see the app.
4. Create a **service account** in the same project, add a JSON key, and store the file outside the repo. It needs no IAM roles: Chat apps authenticate with the `chat.bot` scope.
5. Restart TeamPulse. Settings, Google Chat should now show "Not connected" (amber) instead of "Not set up".

With Docker Compose, point `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` at the key on the host. Then uncomment the key volume line under `app:` in `compose.yaml`, so the container sees it at `/run/secrets/google-chat.json`.

## Check it works

1. Open Google Chat, search for TeamPulse under Apps, and message it "hi". It replies "Connected to TeamPulse as …".
2. In TeamPulse, a manager asks for an update from that person. Within a minute the person gets the request in Google Chat. Their reply shows up in the manager's Requested tab.
3. Send "Summarize my week" in the DM. The briefing agent answers from their records.
4. With check-ins on (dry run is enough), reply to the person's check-in in AI chat or, once live, in the DM:
   `1 is 80%, 2h left`. The work updates, and `undo` reverses it.
5. Send a screenshot with that reply, then open it from the commitment's Files & links tab as the manager. The
   app log shows `Chat message with 1 attachment(s)` with the event's field names (never URLs or names).

## Limits for now

- Only text messages: no cards or buttons yet. Check-in date moves and blockers are confirmed with `yes`/`no` in
  the DM; other proposals are confirmed in TeamPulse.
- Not yet verified with a real file: whether the app's credentials can download an uploaded attachment. If not,
  Open shows "Google Chat did not return this file", and people should share from Drive instead.
- Delivery retries 5 times, then marks the message Failed. The request itself stays in the TeamPulse inbox.
- People are matched by the email Google asserts. Someone without a TeamPulse account gets a "register first" reply.
