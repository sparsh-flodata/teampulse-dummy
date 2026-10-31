# TeamPulse v0.3

- Feature-based frontend and layered backend; scripts, documentation, and local data have dedicated folders. The original requirements are in `docs/requirements/TEAM_PULSE.md`.
- Sidebar header and account footer remain fixed. Only the middle navigation scrolls, with a narrow styled scrollbar and keyboard access.
- Full-page AI chat with people selection, private history, reviewable requests, incoming/outgoing update panels, and work-linked replies.
- 58 supplied company accounts, 13 sample company teams, 116 sample work items, and an editable four-level reporting tree. Existing pilot records are preserved. Roles, work, and reporting lines are illustrative.
- In-app delivery works end to end. WhatsApp has an unconfigured channel adapter and queues requests without external delivery.
- Reporting permissions apply to drafting, delivery, replies, and work changes. Repeated pending requests do not produce duplicate reminders. Chat message receipts and proposal checks remain active.
- Local launch uses port **8787**; the existing ERP on 8765 is unrelated.

See [the account guide](DEMO_ACCOUNTS.md), [architecture](ARCHITECTURE.md), and [verification](VERIFICATION.md).
