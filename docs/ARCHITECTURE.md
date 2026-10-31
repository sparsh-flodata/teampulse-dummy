# TeamPulse v0.3 architecture

## Application

React + TypeScript renders the workspace. Vite proxies `/api` in development; FastAPI serves the built UI and APIs from one origin for normal local use. The application remains operational without an AI provider. State refreshes every 15 seconds while visible and authenticated.

## Data

Teams have optional parents and leads. Employees have roles, primary teams, reporting managers, active state, and personal planning preferences. Work items retain separate, versioned commitments. Dependencies, audit events, notifications, private conversations, proposed agent actions, and message receipts persist in SQLAlchemy-backed SQLite or PostgreSQL.

`backend/app/db/migrations.py` applies explicit versioned additive pilot upgrades and records `schema_migrations`. Existing work/commitment records are preserved. `python -m backend.app.cli.backup` creates an integrity-checked SQLite snapshot in `data/backups`; PostgreSQL requires pg_dump or managed backups. Production migration/rollback and backup recovery procedures remain deployment work.

## Access rules

`backend/app/core/access.py` resolves the transitive reporting hierarchy. Company directory visibility is separate from operational profile access.

| Operation | Employee | Manager | Employer / administrator |
| --- | --- | --- | --- |
| Browse organization/team structure | Yes | Yes | Yes |
| Open complete work profiles/capacity | Self | Self + direct/indirect reports | Organization |
| View project work | Own team's shared work + own assignments | Shared team work + reporting work | Organization |
| Update work | Own | Own + reporting work | Organization |
| Confirm completion/revised dates | Own only | Own only | Own only |
| Accept proposed assignment | Own only | Own only | Own only |
| Assign new/unassigned work | Self creation | Reporting scope | Organization |
| Create projects/employees | No | Scoped team/employee access | Organization |
| Edit roles, reporting lines, team structure | No | No | Yes |
| Read private assistant conversations/proposals | Own only | Own only | Own only |

A report working on another team's project does not grant access to unrelated work in that project. Reporting changes affect the next request. Full profile routes, work history, assignment, mutation, dependency cancellation, and notifications enforce server permissions. Deactivation invalidates existing sessions. Reporting/team cycles are rejected; active reports must be reassigned before a manager is deactivated or demoted.

## Identity

Passwords use salted scrypt. Random session tokens are stored as SHA-256 hashes and delivered in HttpOnly SameSite=Strict cookies. Cookies support Secure on HTTPS. Mutation requests require a custom header and an approved origin; API responses disable caching. Sign-in throttling is in-process. SSO, password recovery, and full session administration remain future work.

## Shared work health

`work_health` derives a label, tone, explanation, and next action from the authoritative commitment, owner confirmation, work status, risks, and unresolved dependencies. Green means recently confirmed work without exceptions; amber means review; red means intervention; neutral means missing/stale confirmation. Aggregations use the same serialized work health. Partial dependencies can be amber; delivery alone does not clear a blocker before requester verification.

## Internal agent ingestion

The signed-in employee's identity and own-work context feed a provider adapter or an explicitly labeled deterministic offline parser. Typed proposals can only call ordinary permission-checked services. No arbitrary database writes or external channel authentication bypass are available.

Message receipts bind `(employee_id, request_id)` to a content fingerprint and response. Repeated messages return the original result; identifier reuse with different content is rejected. Proposed updates retain a base snapshot. Application claims the action, refreshes/locks work, and rejects a changed snapshot before writing. Failed changes roll back.

Employees may opt into automatic saving of explicit progress percentages/remaining hours. This requires the same result from deterministic parsing of the source message. Completion, new commitments, and date changes remain proposed changes requiring confirmation. Private conversation histories are excluded from individual work dashboards.

## Employee update coordination

`services/coordination.py` validates recipients against reporting access, resolves full names or selected people, and drafts `request_updates` proposals. Approved proposals persist participant-scoped `UpdateRequest` records. `channels/delivery.py` implements the delivery contract: the in-app adapter creates the recipient notification; WhatsApp remains explicitly queued and sends nothing. A pending request for the same sender/recipient/channel is reused. Replies can update only the recipient's own selected work through the standard work service. Reporting access is rechecked before replying and before returning response content.

The React chat feature includes private history, reviewable action cards, people selection, outgoing requests, an inbox, and a reply/work-update dialog. The backend is separated into `api/routes`, `services`, `models`, `schemas`, `core`, `db`, `channels`, `seed`, and `cli`; frontend pages live in `frontend/src/features` with shared layout, UI, and library modules. Local databases/backups live in `data`.

Real provider credentials and WhatsApp transport were not available for integration testing.

## Workflow and deployment

A single application process runs deterministic workflow scans every minute. Notifications persist with deduplication keys, remember multi-day commitments, and handle planning, deadlines, and overdue dependencies. Notifications remain in-app. Multiple instances require a distributed worker/lease design.

Docker Compose and a combined frontend/API image are supplied. Docker/PostgreSQL execution, TLS, production monitoring, distributed scheduling, and disaster recovery need target-environment verification before rollout.

## Authoritative organization and project participation

`seed/organization.py` validates root `org-tree.json`, matches emails to existing identities, updates reporting/department membership, and records a source checksum in `DemoSetup`. Unchanged source preserves later UI edits. Roots become administrators, non-root parents managers, and leaves employees. The file does not specify department heads, so these are not inferred. Department grouping is independent of reporting.

`ProjectMember` allows cross-department collaboration. Department ownership or explicit participation grants shared project-work visibility; personal profile/capacity access continues to use the reporting hierarchy. Seeing one report's contribution does not reveal the full unrelated project. Creation, assignment, and dependency ownership validate participant eligibility. Project-card counts describe work visible to the viewer.

Migration 4 adds project participation/setup tables and additive archive flags. The company import retires only known old pilot identities and archives the prior demo projects. Archived work remains persisted but is excluded from current work lists, profiles, capacity, notifications, and workflow scans. The generated portfolio and health examples are seeded once, preserving subsequent edits.

`WorkTable` is a keyboard-focusable region with a fixed viewport-relative height, internal two-axis scrolling, sticky column headers, and the shared thin scrollbar. It is reused across overview, commitments, and person profiles. Org and department trees have bounded exploration regions as well.
