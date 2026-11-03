# TeamPulse

TeamPulse now follows your supplied [organization file](org-tree.json), with separate org/department trees, cross-department project collaboration, and bounded tables with sticky headers. See [the account and hierarchy guide](docs/DEMO_ACCOUNTS.md) for the 58 logins and realistic fictional portfolio.

A local-first work coordination MVP built from [original requirements](docs/requirements/TEAM_PULSE.md). React + TypeScript on the frontend, FastAPI + SQLAlchemy on the backend. SQLite runs without database setup; PostgreSQL is supported for shared deployment.

## Run on Windows

Prerequisites: Python 3.11+, Node.js 22+, [pnpm](https://pnpm.io/) 11 (`corepack enable`), and [uv](https://docs.astral.sh/uv/).

```powershell
cd C:\Workspace\Codex\TeamPulse
uv sync
pnpm install
Copy-Item .env.example .env  # only for a new checkout; preserve your existing .env
pnpm build
.\start.ps1
```

Open **http://127.0.0.1:8787**. API documentation: **http://127.0.0.1:8787/docs**. The start script runs in the foreground; Ctrl+C stops the server. The app saves records in `data/teampulse.db`, and they survive restarts. Port 8787 keeps TeamPulse separate from the existing ERP on port 8765.

For this already-configured workspace, just run `./start.ps1`.

## Demo sign-in

All 58 supplied company emails are ready. The initial password is `TeamPulse-demo-2026!`, configured in `DEMO_PASSWORD` for this workspace. Changing the environment variable after seeding does not change existing passwords. Reporting lines and departments follow `org-tree.json`. Roles are derived from its hierarchy; the project/work portfolio is fictional.

| Demo view | Email |
| --- | --- |
| Management / administrator | `ujjwal@flodataanalytics.com` |
| Solutions manager | `nitish.kumar@flodataanalytics.com` |
| Growth manager | `swati.kashyap@flodataanalytics.com` |
| Employee | `kapil.sharma@flodataanalytics.com` |

[All accounts, teams, reporting lines, and the chat walkthrough](docs/DEMO_ACCOUNTS.md). Everyone has three sample commitments across collaborating projects. Previous pilot records and history remain archived; original fictional pilot logins are inactive. No external emails or WhatsApp messages are sent. The sidebar header and account footer stay fixed while its middle navigation scrolls.

`SEED_COMPANY=true` imports changed organization source on startup and seeds the 8-project portfolio once. `./scripts/seed.ps1` runs the same import. An unchanged source checksum preserves in-app edits. `SEED_DEMO=true` supplies the original fictional pilot only for an initially empty database; the company import retires those logins. Turn both flags off for a clean production database.

## What works

- Session sign-in and logout, salted scrypt password hashing, server-side role and team permissions, request-origin checks, and sign-in throttling.
- Organization overview, employee workspace, project overview, team capacity, shared activity, and a personal notification center.
- Create projects and employees, create and assign work, confirm proposed assignments, update progress and remaining effort, revise expected completion with a reason, and export the current commitment view to CSV.
- Separate work items and versioned commitments. Every delivery-date revision retains its previous date and reason.
- Dependency ownership, optional upstream links, cycle prevention, partial/full blocking, downstream impact counts, delivery, requester verification, and restoration of work when all dependencies are resolved.
- Five-workday capacity estimates that retain blocked effort, reserve operational time, and distinguish unknown from employee-confirmed availability. Confirmations expire after seven calendar days.
- Skill/capacity suggestions for unassigned work, manager proposals, and employee acceptance. No automatic reassignment.
- Private assistant conversations and reviewable proposals. Confirmed proposals use the same permission-checked application services as manual updates.
- A database-backed scheduler checks every minute. It deduplicates deadline prompts, dependency reminders, and two-day dependency escalations. Multi-day work is remembered; it does not trigger daily planning questions. On-demand planning skips planning prompts. Weekly/hybrid plans receive Monday review prompts; missing plans get one prompt per planning period.
- Automatic dashboard refresh every fifteen seconds while the page is visible. This is polling, not WebSockets.

## AI chat and update requests

Open **AI chat** for private instructions and work planning. Ask `Take an update from Kapil Sharma about the client review`, or select teammates through **Add people**. Review the proposed recipients and prompt, then choose **Request updates**. Requests appear in the employee's **My inbox**; **Reply & update** saves a response and optionally updates their selected work item. The requester sees the response under **Requested**. Permissions are checked when drafting, sending, and replying. Existing pending requests are reused to avoid repeated reminders.

The in-app channel works end to end. The WhatsApp adapter is intentionally unconfigured: requests to it stay queued with an explicit explanation. A later adapter should use an outbox worker and verified sender/reply identities.

## Conversational planning

Without provider credentials, the assistant clearly displays **Offline planning**. This is a deterministic helper, not a language model. Try:

- `Summarize my commitments`
- Select one of your work items in **Work context**, then: `65% complete, 4 hours remaining`
- Select your work item, then: `Finished` (completion is proposed for your confirmation)
- `Plan: Build the monthly report; 4 hours; due 2026-11-03; project ERP Implementation` (use a current/future date)

Ambiguous/negative completion statements ask for more information. Dependencies use a guided form in offline mode. Significant changes require **Confirm & save**. In Settings, employees may opt into automatic saving of explicit progress percentages and remaining hours for selected work. Completion, delivery dates, and new commitments still require confirmation. Message identifiers deduplicate retries, and stale proposals cannot overwrite newer updates. Conversations are visible only to their author. No external messages or email are sent.

For a real model, set `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` on the server. The adapter expects a chat-completions-compatible endpoint at `<AI_BASE_URL>/chat/completions` supporting JSON responses. The signed-in employee's work, visible project names, and requestable reporting-team names/IDs/titles are included as context. The user's message is also sent to the configured provider; private conversations of other people are excluded. If the provider fails, offline planning remains available. Provider connectivity has not been tested with real credentials.

## Project structure

```text
backend/app/       API, services, models, schemas, access rules, channels, seeds, CLI
backend/tests/     Isolated workflow, hierarchy, privacy, and coordination tests
frontend/src/      App shell, shared UI, feature pages, client library, styles
scripts/           Start, company seed, and database backup commands
docs/              Requirements, architecture, account guide, release notes, previews
data/              Local database and backups (ignored by Git/Docker)
```

Root `package.json` and `pnpm-workspace.yaml` orchestrate the frontend pnpm workspace; root `pyproject.toml` manages Python. The frontend is a TanStack Start app in SPA mode; its build output in `frontend/dist/client` is served by FastAPI.

## Development and tests

Use two terminals for hot reload:

```powershell
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8787
pnpm dev
```

The Vite server prints its local URL (normally port 5173) and proxies `/api` to port 8787. Add changed origins to `ALLOWED_ORIGINS` if necessary. Built assets are served by FastAPI for the one-process launch.

```powershell
.venv/Scripts/python.exe -m pytest -q
pnpm typecheck
pnpm lint
pnpm build
```

Tests use isolated in-memory databases and never modify your pilot database.

## Start with a clean organization

Set `SEED_DEMO=false` and `SEED_COMPANY=false`, and point `DATABASE_URL` to a new empty database. Then bootstrap the first administrator; the password is prompted and never passed in a command argument:

```powershell
.venv/Scripts/python.exe -m backend.app.cli.bootstrap --email you@company.com --name "Your Name" --team Engineering
```

Sign in, create teams/projects, and add teammates. Everyone has a personal dashboard and can browse the organization directory. Managers can open full profiles only for direct and indirect reports; administrators can open all profiles. Shared project work is visible to the owning department and explicitly invited participants; a report on another project grants only that report's work. Structure visibility never grants access to private profiles or conversations.

## PostgreSQL and Docker

Set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/teampulse` to use an existing PostgreSQL database. For Docker, add `POSTGRES_PASSWORD` to `.env` and use a URL-safe generated database password. Then:

```powershell
docker compose up --build -d
# For a fresh non-demo database:
docker compose exec app python -m backend.app.cli.bootstrap --email you@company.com --name "Your Name"
```

The compose file binds the app to local loopback and persists PostgreSQL in a named volume. The image serves both frontend and API. Run one application process for the included scheduler; a distributed job queue is a later deployment step. Docker/PostgreSQL deployment files are provided but have not been executed in this environment.

The pilot includes versioned additive SQLite/PostgreSQL schema upgrades in `backend/app/db/migrations.py`. Existing pilot work and commitment history are preserved. Before an upgrade, create a consistent SQLite backup with `.venv/Scripts/python.exe -m backend.app.cli.backup`; verified backup files are saved in `data/backups/`. PostgreSQL backups require pg_dump or a managed backup service. Before organizational rollout, add HTTPS and secure cookies, managed secrets, scheduled backups/recovery drills, SSO/password recovery, production monitoring, and a distributed worker. The pilot migration runner is not a substitute for a reviewed production migration/rollback process. This is a working pilot MVP, not completion of the entire multi-release product roadmap.

See [product scope](docs/PRODUCT.md), [interface](docs/UI.md), [architecture](docs/ARCHITECTURE.md), and [remaining roadmap](docs/ROADMAP.md).
