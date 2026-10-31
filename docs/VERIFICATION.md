# Verification record

Verified locally on 30 October 2026.

- `npm run build`: TypeScript compilation and Vite production bundle passed.
- `python -m pytest -q`: 16 tests passed against isolated in-memory databases.
- `python -m compileall -q backend`: backend syntax check passed.
- Browser: manager login, new pilot commitment with separate effort/completion date, assistant proposal without immediate mutation, explicit confirmation updating progress and remaining hours, persisted dashboard refresh, desktop layout, 390px mobile layout, mobile sidebar/project navigation, and no page-level horizontal overflow.

The pilot commitment created during browser verification is named **Pilot review and acceptance**, with 25% progress and 4 hours remaining after confirmation. The screenshot in previews/preview.jpg shows the local workspace with sample data.

The test runner emits one upstream Starlette notice about its deprecated httpx test-client adapter. This does not affect test success or application requests.

Not verified: real AI-provider credentials, Docker image execution, PostgreSQL execution, external messaging (not implemented), production TLS, or a multi-instance deployment. These are recorded as rollout work rather than reported as completed capabilities.

## Phase 2 verification — 31 October 2026

- 28 tests pass across the original workflows and phase-2 additions. Coverage includes reporting scope, directory privacy, cross-team report access without whole-project leakage, immediate permission changes, circular reporting/teams, inactive sessions, health aggregation, additive legacy migration, retry receipts, automatic routine updates, and stale proposal rejection.
- Production TypeScript/Vite build passes. Python modules compile successfully.
- Browser verified: personal default scope, reporting-team cards with green/red indications, full manager profile and direct-report links, collapsible organization hierarchy, team tree, administrator team form, mobile navigation/focus handling, and no page-level horizontal overflow at 390px.
- Saved previews: previews/phase2-team.jpg, previews/phase2-organization.jpg, previews/phase2-mobile.jpg.
- A consistent SQLite backup completed with `PRAGMA integrity_check` returning `ok`.
- Real AI-provider credentials, Docker/PostgreSQL execution, distributed scheduling, and WhatsApp remain unverified or deferred as described in PHASE_2.md.

## Version 0.3 verification — 31 October 2026

- All 37 isolated backend tests pass after the source reorganization. New coverage includes company seed idempotency, password verification for all 58 accounts, reporting-scoped update requests, private participants, permission changes, work-linked replies, duplicate pending-request reuse, unconfigured WhatsApp queues, and recipient-aware message receipts.
- Production frontend build passes from the root npm workspace after removing duplicate root source/build folders. Python modules compile.
- Actual company seed: 58 accounts and 116 sample work items created. A repeat run reports 0 new accounts and 0 new work items. Original seven pilot accounts and previous work/history remain present.
- Browser: Management and recipient logins; chat instruction resolves Ankita, shows a reviewable draft, and delivers to her TeamPulse inbox only after confirmation. Her reply changes her selected sample work to 75% with 3 hours remaining; the Management sees the returned response. Work detail confirms the persisted values.
- Browser: desktop sidebar middle scrolls 633px while header/footer bounds remain unchanged; mobile middle scrolls 527px with header/footer fixed. CSS sets its scrollbar to 4px with thin native fallback.
- Browser: 1280×720 chat composer remains inside the viewport; 390×844 chat/update panes work with no page-level horizontal overflow. Mobile navigation closes and restores focus.
- Verified SQLite backup saved in `data/backups/`. Pre-restructure source and database recovery copies are retained there. No unrelated application on port 8765 was changed; TeamPulse uses 8787.
- Saved previews: `previews/phase3-chat.png`, `previews/phase3-mobile.png`, and `previews/phase3-organization.png`.
- Real model-provider connectivity, WhatsApp transport, Docker/PostgreSQL execution, and production deployment remain unverified. Offline planning and in-app coordination are the tested local flows.

- Follow-up company seed test passed after adding completed-import preservation: renaming sample work does not recreate it on subsequent seed runs. Organization search expands matching paths while the default tree keeps other branches compact.


## Organization import and collaborative portfolio — 31 October 2026

- Final regression suite: **41 tests passed**. Coverage includes exact reporting/department mapping for all 58 supplied identities, preserved passwords, source validation before writes, checksum-based re-import, cross-department collaboration without private profile access, and archived-history exclusion from live capacity/work. The existing upstream Starlette test-client deprecation notice remains non-blocking.
- Production TypeScript/Vite build and Python compilation passed.
- The supplied `org-tree.json` imports 58 active profiles across 8 departments, with Ujjwal and Vaibhav as roots. The prior 7 fictional pilot accounts are inactive. Re-import of unchanged source creates 0 accounts and 0 work items.
- The active demo portfolio has 8 projects, 174 commitments, and 16 cross-department handovers, plus fictional work activity, commitment revisions, capacity variation, and 56 manager check-in exchanges. Healthy, review, and intervention project examples are covered by a regression assertion.
- Browser: Nitish's manager session shows 7 direct reports; search renders Ujjwal → Nitish → Kapil. Department search shows Vanshika in Engineering and Analytics reporting to Swati. Org and Department tabs render independently.
- Browser: 106 visible commitments remained inside a 353px table. Scrolling its rows by 1440px left the column header at the same screen position. Mobile table width remained bounded; content scrolled horizontally by 235px while page horizontal scroll stayed at 0.
- Browser: Kapil's employee login shows 3 personal commitments, no manager-only team navigation, and an incoming check-in from Nitish. The initial manager session was restored after QA. Browser console had no application errors during these checks.
- Saved previews: `previews/imported-org-tree.png`, `previews/imported-department-tree.png`, `previews/fixed-height-table.png`, and `previews/mobile-fixed-table.png`.
- Pre-import source and integrity-checked database recovery copies are retained in `data/backups/`. Latest SQLite backup verified successfully. Docker/PostgreSQL, real AI-provider credentials, and WhatsApp remain outside this local verification.
