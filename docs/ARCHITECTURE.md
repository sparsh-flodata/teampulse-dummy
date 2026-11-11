# TeamPulse v0.4 architecture

## Application

React + TypeScript renders the workspace. Vite proxies `/api` in development; FastAPI serves the built UI and APIs from one origin for normal local use. The application remains operational without an AI provider. State refreshes every 15 seconds while visible and authenticated.

## Data

Teams have optional parents and leads. Employees have roles, primary teams, reporting managers, active state, and personal planning preferences. Work items retain separate, versioned commitments. Dependencies, audit events, notifications, private conversations, proposed agent actions, and message receipts persist in SQLAlchemy-backed SQLite or PostgreSQL.

`backend/app/db/migrations.py` applies explicit versioned additive pilot upgrades and records `schema_migrations`. Existing work/commitment records are preserved. `python -m backend.app.cli.backup` creates an integrity-checked SQLite snapshot in `data/backups`; PostgreSQL requires pg_dump or managed backups. Production migration/rollback and backup recovery procedures remain deployment work.

## Access rules

`backend/app/core/access.py` resolves the transitive reporting hierarchy. Company directory visibility is separate from operational profile access.

| Operation | Employee | Manager | Management / administrator |
| --- | --- | --- | --- |
| Browse organization/team structure | Yes | Yes | Yes |
| Open complete work profiles/capacity | Self | Self + direct/indirect reports | Organization |
| View project work | Own team's shared work + own assignments | Shared team work + reporting work | Organization |
| Update work | Own | Own + reporting work | Organization |
| Confirm completion/revised dates | Own only | Own only | Own only |
| Accept proposed assignment | Own only | Own only | Own only |
| Assign or reassign a project commitment | Take an unassigned one on a project they work on | Anyone in the organization | Anyone in the organization |
| Create projects/employees | No | Scoped team/employee access | Organization |
| Edit roles, reporting lines, team structure | No | No | Yes |
| Read private assistant conversations/proposals | Own only | Own only | Own only |

Assigning someone outside a project adds them as a participant. A reassignment notifies the previous and new owner; the new owner confirms the commitment unless they took it themselves. Completed work is not reassigned. Editing someone else's work (status, progress, dates) still follows the reporting rules above.

## Project page

`GET /api/projects/{id}` (`services/projects.py`) returns one project within the viewer's access: department and lead, people involved (owning department, invited, anyone owning work there) with their open work, the visible commitments, effort-weighted progress and status counts, open dependencies, recent updates on its commitments, and what the viewer may do there. The frontend route `/projects/$projectId` shows it in Overview, Commitments, Board (kanban by status; drag or "Move to" changes status, and the server still decides), People and Activity tabs.

A report working on another team's project does not grant access to unrelated work in that project. Reporting changes affect the next request. Full profile routes, work history, assignment, mutation, dependency cancellation, and notifications enforce server permissions. Deactivation invalidates existing sessions. Reporting/team cycles are rejected; active reports must be reassigned before a manager is deactivated or demoted.

## Identity

Passwords use salted scrypt. Sign-in returns a 15-minute HS256 JWT access token (`Authorization: Bearer`) and an opaque refresh token stored as a SHA-256 hash in `refresh_tokens`. Refresh rotates the token; presenting an already-rotated token revokes that whole sign-in (token family). Logout revokes the family; deactivation revokes all of a person's refresh tokens and `current_user` rejects inactive accounts at once. Set `JWT_SECRET` in production; without it a per-installation key is kept in `data/.jwt-secret`.

Self-registration (`POST /api/auth/register`) and admin-created employees accept only `ALLOWED_EMAIL_DOMAINS` (default `flodataanalytics.com`, exact domain match). New registrants join `REGISTRATION_TEAM` (or the first top-level team) as employees until an administrator places them. Email ownership is not verified yet; Google Chat linking uses the email Google asserts. Mutation requests still require the `X-TeamPulse-Request` header and an approved origin; sign-in throttling is in-process.

## Dependencies and linked commitments

Adding a dependency (from the create form, a commitment's Dependencies tab, the API, or the assistant) creates a commitment for the person it waits on, in the same project, due when the deliverable is needed. They confirm it like any assignment. The dependency keeps `upstream_work_id` pointing at that commitment and follows it: confirmed means Accepted, started means In Progress, ready for review means Delivered, and completed means the dependency is fulfilled (Verified) and the waiting work is unblocked. Both people are notified and the history records it. Choosing existing work as the upstream links instead of creating one. Managers and administrators can ask anyone in the organization (they join the project); everyone else asks people on the project. A new commitment can carry its dependencies in `POST /api/work` (`dependencies`), created atomically.

## Shared work health

`work_health` derives a label, tone, explanation, and next action from the authoritative commitment, owner confirmation, work status, risks, and unresolved dependencies. Green means recently confirmed work without exceptions; amber means review; red means intervention; neutral means missing/stale confirmation. Aggregations use the same serialized work health. Partial dependencies can be amber; delivery alone does not clear a blocker before requester verification.

## Internal agent ingestion

`backend/app/agents/graph.py` is a LangGraph state graph: `gather_context → route → agent → validate → policy`. The agents are coordination (request updates), planning (new commitment), progress (own selected work), dependency (what selected work waits on), briefing (own week, or a manager's reporting team, from records), model (the configured chat-completions provider, e.g. Groq via `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY`) and guide. Agents only propose. `validate` re-checks permissions; `policy` applies at once any update to the person's own work that only changes status, progress or hours and that the message states (`checkin_reply.stated_in`), under `agent_auto_updates` (on by default). Confirmed proposals go through the ordinary services. Each assistant message records which agent answered. In-app chat and Google Chat both enter through `services/proactive.handle_inbound` (below); messages that are not check-in business reach this graph.

Message receipts bind `(employee_id, request_id)` to a content fingerprint and response. Repeated messages return the original result; identifier reuse with different content is rejected. Proposed updates retain a base snapshot. Application claims the action, refreshes/locks work, and rejects a changed snapshot before writing. Failed changes roll back.

Direct updates (status, progress, hours, completion) are recorded as `AgentAction(status='Applied')` with before/after snapshots, and for a completion the dependencies it fulfilled, so `undo` can reverse them for `UNDO_WINDOW_MINUTES`. Numbers must appear in the message and completion needs an unhedged completion word. New commitments, date changes, dependencies and update requests remain proposals requiring confirmation. Private conversation histories are excluded from individual work dashboards.

## Employee update coordination

`services/coordination.py` validates recipients against reporting access, resolves full names or selected people, and drafts `request_updates` proposals. Approved proposals persist participant-scoped `UpdateRequest` records. `channels/delivery.py` implements the delivery contract: the in-app adapter creates the recipient notification; the Google Chat adapter does the same and also queues a DM in `channel_outbox` for people who connected the Chat app (see `docs/GOOGLE_CHAT.md`). The workflow tick sends the outbox with retries. A pending request for the same sender/recipient/channel is reused. Replies can update only the recipient's own selected work through the standard work service. Reporting access is rechecked before replying and before returning response content.

The React chat feature includes private history, reviewable action cards, people selection, outgoing requests, an inbox, and a reply/work-update dialog. The backend is separated into `api/routes`, `services`, `models`, `schemas`, `core`, `db`, `channels`, `seed`, and `cli`; frontend pages live in `frontend/src/features` with shared layout, UI, and library modules. Local databases/backups live in `data`.

Google Chat transport needs the Cloud project values in `docs/GOOGLE_CHAT.md`; its event verification, linking, outbox and reply paths are covered by tests with Google stubbed.

## Proactive check-ins

Design and decisions: `docs/PROACTIVE_ASSISTANT_PLAN.md`. Operation: `docs/PILOT_RUNBOOK.md`.

- **Outbound** (`services/proactive.py`). Each workflow tick calls `run_check_ins`. On weekdays from `CHECKIN_HOUR`
  to 18:00 it creates at most one `daily` `CheckIn` per opted-in person (and only those in `PROACTIVE_PILOT_EMAILS`
  when set). The unique `(employee_id, kind, period)` constraint makes duplicates impossible across ticks, restarts
  and processes. The message is stored as an assistant turn, a notification, and a Chat outbox row (`Skipped` in
  dry run). Manager update requests open a `request` check-in, so the reply also updates the work.
- **Inbound router** (`handle_inbound`). For both channels, in order: commands (`pause`, `resume`, `undo`, `help`),
  a pending yes/no, a reply to the newest open check-in, otherwise the assistant graph. Receipts deduplicate retries.
- **Reply handling** (`services/checkin_reply.py`). The deterministic parser reads the reply first; the model is
  asked only when the parser is unsure. Every extracted value must appear in the message (validation runs on both
  paths). Progress, hours, the start of work and completion apply at once as `AgentAction(source='checkin',
  status='Applied')` with before/after snapshots for `undo`. Date moves (with a reason) and blockers become
  proposals confirmed by `yes` or the in-app card. Ambiguity gets one templated question at a time, two rounds at most.
  Confirmed slips and blockers notify the manager. Reply text comes from templates, never from the model.
- **Files and links** (`services/attachments.py`, `api/routes/attachments.py`). References only: Chat attachment
  resource names, Drive file ids, or URLs, one row per commitment. Listing and opening re-check `visible_work`.
  Open links carry a 30-minute per-viewer, per-file token. Chat uploads are streamed from the Chat API on open,
  never stored, and only images and PDFs display inline (`Content-Security-Policy: sandbox`, `nosniff`).
- **Format** (`services/formatting.py`, `components/ui/RichText.tsx`). One markdown subset, sanitized before
  storage, rendered as Google Chat syntax at the Chat edge and as React elements in the app (never raw HTML).

## Workflow and deployment

A single application process runs deterministic workflow scans every minute: notifications, daily check-ins, then the Google Chat outbox. Notifications persist with deduplication keys, remember multi-day commitments, and handle planning, deadlines, and overdue dependencies. Update requests, check-ins and manager notices also go to Google Chat for people who connected it. TeamPulse's own loggers (`teampulse.*`) print at INFO with ids and counts only, never message text. Multiple instances require a distributed worker/lease design.

Docker Compose runs PostgreSQL and the app, restarts both, and passes the proactive settings; the pilot machine runs it. TLS, production monitoring, distributed scheduling, and disaster recovery need target-environment verification before rollout.

## Authoritative organization and project participation

`seed/organization.py` validates root `org-tree.json`, matches emails to existing identities, updates reporting/department membership, and records a source checksum in `DemoSetup`. Unchanged source preserves later UI edits. Roots become administrators, non-root parents managers, and leaves employees. The file does not specify department heads, so these are not inferred. Department grouping is independent of reporting.

`ProjectMember` allows cross-department collaboration. Department ownership or explicit participation grants shared project-work visibility; personal profile/capacity access continues to use the reporting hierarchy. Seeing one report's contribution does not reveal the full unrelated project. Creation, assignment, and dependency ownership validate participant eligibility. Project-card counts describe work visible to the viewer.

Migration 4 adds project participation/setup tables and additive archive flags. The company import retires only known old pilot identities and archives the prior demo projects. Archived work remains persisted but is excluded from current work lists, profiles, capacity, notifications, and workflow scans. The generated portfolio and health examples are seeded once, preserving subsequent edits.

`WorkTable` is a keyboard-focusable region with a fixed viewport-relative height, internal two-axis scrolling, sticky column headers, and the shared thin scrollbar. It is reused across overview, commitments, and person profiles. Org and department trees have bounded exploration regions as well.
