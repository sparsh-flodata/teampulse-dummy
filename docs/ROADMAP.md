# Delivery status and next releases

## Delivered in v0.2

- Employee, manager, and Management access with universal personal workspaces.
- Complete person dashboards, reporting-team summaries, organization and nested team trees.
- Direct/indirect reporting permissions, directory/profile separation, and server checks across work, history, assignments, and profiles.
- Administrator management of teams, reporting lines, roles, transfers, and active accounts, with cycle and lockout checks.
- Shared green/amber/red/neutral health signals, reasons, and suggested actions across work, profiles, projects, and team views.
- Commitments and revisions, direct work updates, dependencies and verification, downstream impact, confirmed capacity, assignments and employee acceptance.
- Private assistant history/proposals, optional model adapter, offline planning, opt-in explicit progress updates, message deduplication, and stale-proposal protection.
- In-app workflow notifications, daily briefing, automatic dashboard refresh, responsive screens, additive schema migrations, and a verified SQLite backup utility.

## Delivered in v0.3

- Structured frontend/backend modules, dedicated data/scripts/docs folders, and fixed sidebar controls with a scrollable middle.
- Full AI chat workspace, reporting-scoped update requests, private in-app delivery/replies, and work-linked progress updates.
- 58 supplied company accounts, editable sample reporting/team trees, and 116 illustrative work items. Completed seed imports preserve later organization/work edits.
- Delivery channel contract with an explicitly unconfigured WhatsApp adapter for later integration.

## Current organization and collaboration update

- Authoritative `org-tree.json` import with 58 identities and 8 departments; distinct reporting and department trees.
- Explicit cross-department project participation with reporting-based personal profile access.
- Eight fictional delivery initiatives, three commitments per person, handovers, versioned changes, check-ins, and varied project health.
- Fixed-height work tables with sticky headers and internal desktop/mobile scrolling.
- Additive archive flags preserve earlier pilot history while keeping current dashboards focused.

## Next: validate with a real team

1. Pilot with 5–10 people and real reporting relationships for 2–4 weeks.
2. Measure plan coverage, update freshness, blocker resolution time, reporting burden, and agent interpretation corrections.
3. Connect the chosen model provider and evaluate ambiguity, negation, dates, dependencies, and permission boundaries using pilot examples.
4. Add assignment decline/clarification and manager-requested delivery-date revisions.
5. Refine team/project membership and cross-team collaboration using real pilot feedback.

## Before organizational rollout

- SSO or password recovery, account/session management, and operational administration.
- PostgreSQL and Docker integration checks on the deployment target.
- Reviewed production migrations/rollback, scheduled backups, and recovery drills.
- HTTPS/secure cookies, managed secrets, application monitoring, error tracking, and CI.
- A distributed job worker with leases/retries for multiple instances.
- Business calendars, holidays, quiet hours, and configurable escalation rules.

## Later: communication and intelligence

WhatsApp is explicitly deferred for the user's later integration. Its authenticated adapter should call the existing internal update service. Further work includes rich language-based dependency extraction, manager briefing actions/decision logs, handovers, uncertainty-aware allocation, validated delivery forecasts, and optional external work-source integrations. Avoid automatic reassignment, surveillance, and performance judgments.
