# Pilot product specification

TeamPulse coordinates employee-reported and manager-assigned work. The pilot proves that people can report with little effort, managers see reliable delivery context, and dependencies can be resolved without repeated status collection.

## User stories and acceptance

| User | Need | Acceptance |
| --- | --- | --- |
| Employee | Plan a deliverable | Create scoped work with a separate estimate and completion date; it survives restart. |
| Employee | Review assigned work | Manager assignment remains unconfirmed until its owner accepts feasibility. |
| Employee | Explain changed delivery | Revise an expected completion with a reason; the original commitment remains in history. |
| Employee | Report progress | Update status, percentage, and remaining effort directly, without AI. |
| Employee | Plan conversationally | Assistant drafts a validated proposal; only confirmation modifies authoritative work. |
| Requester | Track a blocker | Record deliverable, owner, expected delivery, impact, and whether other work can continue. |
| Dependency owner | Deliver an output | Acknowledgment and delivery are visible; delivery alone does not unblock work. |
| Requester | Verify an output | Verification/cancellation removes the dependency; unresolved full dependencies continue to block. |
| Manager | Understand exceptions | Dashboard distinguishes overdue, risk, unconfirmed progress, and partial blockers; metrics drill into work. |
| Manager | Allocate intelligently | Review skill/capacity ordering, propose unassigned work, and request employee confirmation. |
| Employee | Control availability | Reserve non-task time, confirm capacity, and choose planning cadence. Missing/stale confirmation means unknown. |

## Rules

- Work status, percentage, remaining effort, expected completion, and delivery health are separate fields.
- Never infer availability from a lack of work records or progress from silence.
- Multi-day commitments suppress unnecessary daily planning prompts.
- Only the work owner can confirm completion and revised dates. Managers can set priorities with an explanation.
- Work cannot complete with unresolved dependencies; dependency cycles are rejected.
- Conversations are private; project work and its update history are shared with the owning team. Managers can open full profiles for direct/indirect reports; the Management can inspect the organization.
- Recorded changes and proposals are auditable. No surveillance or performance scoring.

The seven original pilot profiles are retained alongside 58 supplied company email accounts. Reporting lines, titles, skills, projects, and work are illustrative and editable. The remaining production and intelligence work is recorded in ROADMAP.md.
