# Google Chat app

TeamPulse talks to people through a Google Chat app, in direct messages only.

- **People connect themselves.** Someone opens Google Chat, finds the TeamPulse app and sends it a message. Google tells TeamPulse their verified email. If it matches an active `@flodataanalytics.com` account, that DM becomes their TeamPulse channel. Settings shows "Connected".
- **Messages in.** A message in the DM goes to the assistant graph (`backend/app/agents/graph.py`), the same one behind in-app chat. If someone asked this person for an update, their next message answers that request instead. Proposed changes still need confirming in TeamPulse; the reply includes the link.
- **Messages out.** These are queued in `channel_outbox` and sent by the workflow tick, which runs every minute:
  - Update requests (they also stay in the TeamPulse inbox).
  - Check-in and planning nudges.
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

## Limits for now

- Only text messages: no cards or buttons yet. Confirming a proposed change still happens in TeamPulse.
- Delivery retries 5 times, then marks the message Failed. The request itself stays in the TeamPulse inbox.
- People are matched by the email Google asserts. Someone without a TeamPulse account gets a "register first" reply.
