# Interface specification

The visual system uses a quiet off-white canvas, white panels, iris accents, Manrope headings, DM Sans body type, compact status indicators, and persistent navigation. System fonts remain usable if Google Fonts is unavailable. No external image assets are required.

## Screens and flows

- **Sign in:** secure session login; seeded local pilot accounts are documented. Invalid credentials produce an inline error.
- **Overview:** greeting and date, a work summary, four clickable exception/capacity metrics, filterable work table, dependency preview, factual daily brief, and plan coverage.
- **My work:** the signed-in employee's commitments and confirmed/unknown capacity, plus work creation and direct updates.
- **All commitments:** search by work/owner/project/skills, team/project filters, active/attention/all views, and CSV export. Metric drill-down also exposes blocked work.
- **Work detail:** scope, owner, delivery health, expected date, effort, editable progress, remaining hours, notes, revision reason, commitment acceptance, dependencies, and immutable commitment revision history.
- **Projects:** purpose, aggregate progress, completed commitments, contributing people, owning team, and drill-down. Managers can create projects.
- **Dependencies:** open/all/ready-to-verify views; deliverable, ownership, expected date, impact, partial/full state, downstream count, and role-appropriate actions.
- **Team & capacity:** working/committed/reserved/available hours, skills, confirmation state, and a person detail view. Managers can add teammates.
- **Activity:** chronological shared work events with links to their work items.
- **Settings:** planning cadence, five-workday working hours, reserved operational time, employee capacity confirmation, and data-use information.
- **Assistant drawer:** private history, own-work context selection, structured offline planning or optional connected model, readable proposed fields, confirmation, and dismissal.
- **Notifications:** meaningful in-app requests and reminders; clicking acknowledges an item and opens the affected work.

## Interaction behavior

Forms use native labels and validation, loading states, inline errors, success notifications, and keyboard-operable controls. Dialogs support Escape and focus containment; the responsive sidebar becomes a drawer below 760px. Work tables scroll horizontally without causing page overflow. Reduced-motion preferences disable animations. Dashboard polling refreshes every 15 seconds only while visible.


## Phase 2 screens

- Overview starts in My workspace for every role. Managers can select Reporting team, and administrators can select Organization. Metric drill-down preserves the selected work scope.
- My profile opens a full personal dashboard. My team offers direct/all reports with health-colored cards. Clicking a permitted person opens their complete work profile, capacity, dependencies, activity, and direct reports.
- Organization includes a collapsible reporting tree, nested team tree, directory search, inactive-account toggle for admins, and team/reporting edit forms. Directory-only people show a lock instead of an operational profile link.
- Green gradients mean confirmed work without exceptions. Amber means review. Red means intervention. Gray means missing/stale confirmation. Health reasons and next actions are shown in work detail, alongside explicit labels and icons.
- Settings exposes opt-in automatic progress updates. Significant assistant changes remain reviewable proposals. Private conversations are excluded from person dashboards.
