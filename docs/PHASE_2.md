# Phase 2: reporting and work visibility

Delivered on 31 October 2026, following the user's hierarchy and attention-color feedback.

## Explore

- **Overview → My workspace:** personal work for every role, including the employer.
- **Overview → Reporting team:** direct and indirect reports, excluding your own commitments.
- **Overview → Organization:** administrator-only organization scope.
- **My profile:** your complete work dashboard.
- **My team:** direct/all reports; open a person to inspect commitments, dependencies, capacity, history, and their reports.
- **Organization:** reporting tree and nested team tree. Everyone can browse the structure. Full profile buttons follow server permissions.
- **Organization → Edit reporting / New team / Edit team:** administrator management of reporting lines, parent teams, leads, roles, transfers, and active accounts. Cycles and unsafe demotions/deactivations are rejected.

Demo: Nitish is the employer/administrator. Rahul is a reporting manager with Priya and Karan as reports. Ananya remains an employee. The original pilot commitments and history are preserved.

## Health

Green means recent owner confirmation without delivery exceptions. Amber means review (for example partial dependency or verification). Red means action (blocked, overdue, or explicitly at risk). Gray means unconfirmed or stale information. Every commitment has a reason and a next action. Colors are supplemented by labels and icons.

A dependency does not automatically mean red. Acknowledged partial dependencies can be amber while other work continues. Delivery does not remove a blocker until the requester verifies it.

## Internal agent workflow

The in-app assistant uses authenticated identity → existing-work context → interpretation → application validation → persistent update/proposal → refreshed dashboards. Requests may supply `request_id`; repeated content with the same identifier is deduplicated, and identifier reuse for different content is rejected.

Employees can opt into saving explicit percentages and remaining hours automatically in Settings. Other changes still require confirmation. Proposals remember the source work state and cannot silently overwrite a newer update. The model provider remains optional and has not been tested with real credentials.

No WhatsApp integration, public message webhook, or outbound messaging was implemented. A future adapter must verify sender identity and invoke the same internal services.

## Data and rollout

`backend/app/db/migrations.py` applies versioned additive pilot upgrades. `data/backups/before-phase2.db` preserves this workspace's original database. Use `python -m backend.app.cli.backup` for further verified SQLite snapshots. Do not replace the pilot database to upgrade.

Production SSO/password recovery, distributed scheduling, PostgreSQL/Docker execution, monitoring, formal recovery procedures, quiet hours, holidays, and messaging adapters remain in the roadmap.
