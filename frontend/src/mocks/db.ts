// In-browser mock database. One shared set of entities (so a change made by
// one account is visible to the others) plus a per-account "view": which
// records that account can see and what it may edit. Persisted to
// localStorage so mock sessions and edits survive reloads.
import seedJson from "./fixtures/seed.json";
import { summarizeHealth } from "@/features/workspace/domain";
import type {
  Activity,
  AgentAction,
  ChatMessage,
  CommitmentRevision,
  Dependency,
  DirectoryPerson,
  HealthSummary,
  Notice,
  Person,
  Project,
  Team,
  UpdateRequest,
  Work,
  WorkspaceState,
  Profile,
} from "@/features/workspace/types";

export type View = {
  profile_ids: number[];
  report_ids: number[];
  viewable_profile_ids: number[];
  can_manage_org: boolean;
  health: HealthSummary;
  work_ids: number[];
  editable_work_ids: number[];
  employee_ids: number[];
  project_ids: number[];
  dependency_ids: number[];
  activity_ids: number[];
};

type Session = { userId: number; expiresAt: number };

export type MockDb = {
  meta: {
    today: string;
    demo_mode: boolean;
    organization_source: string | null;
    assistant_connected: boolean;
  };
  accounts: { user_id: number; email: string }[];
  views: Record<string, View>;
  teams: Team[];
  directory: Omit<DirectoryPerson, "can_view_profile">[];
  employees: Person[];
  projects: Project[];
  work: Omit<Work, "can_edit">[];
  dependencies: Dependency[];
  activity: Activity[];
  notifications: (Notice & { user_id: number })[];
  updateRequests: Omit<UpdateRequest, "can_reply">[];
  workHistory: Record<string, CommitmentRevision[]>;
  conversations: Record<
    string,
    { messages: ChatMessage[]; actions: AgentAction[] }
  >;
  accessTokens: Record<string, Session>;
  refreshTokens: Record<string, Session>;
};

const STORAGE_KEY = "teampulse.mockdb.v1";
export const DEMO_PASSWORD = "TeamPulse-demo-2026!";

/** Fills fields added after the seed (or a stored copy) was written. */
function withDefaults(data: MockDb): MockDb {
  for (const p of data.employees) {
    p.proactive_checkins ??= true;
    p.checkins_paused_until ??= null;
  }
  return data;
}

function fresh(): MockDb {
  return withDefaults({
    ...(structuredClone(seedJson) as unknown as Omit<
      MockDb,
      "accessTokens" | "refreshTokens"
    >),
    accessTokens: {},
    refreshTokens: {},
  });
}

function load(): MockDb {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return withDefaults(JSON.parse(stored) as MockDb);
  } catch {
    // Fall through to a fresh seed.
  }
  return fresh();
}

export const db: MockDb = load();

/**
 * Re-reads the shared database before handling a request. Each tab runs its
 * own copy of the handlers, so without this one tab would act on stale data
 * (and overwrite another tab's changes) — e.g. a manager tab assigning work
 * that an employee tab then updates.
 */
export function reloadDb() {
  Object.assign(db, load());
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: keep the in-memory copy.
  }
}

/** Restore the original snapshot. Signed-in mock sessions are kept. */
export function resetMockData() {
  const { accessTokens, refreshTokens } = db;
  Object.assign(db, fresh(), { accessTokens, refreshTokens });
  persist();
}

// ---------------------------------------------------------------- helpers

export const now = () => new Date().toISOString();
export const nextId = (rows: { id: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

export const viewOf = (userId: number) => db.views[String(userId)];
export const employee = (id: number | null | undefined) =>
  db.employees.find((p) => p.id === id);
export const adminIds = () =>
  Object.entries(db.views)
    .filter(([, v]) => v.can_manage_org)
    .map(([id]) => Number(id));

type ViewList = keyof Pick<
  View,
  | "work_ids"
  | "editable_work_ids"
  | "employee_ids"
  | "project_ids"
  | "dependency_ids"
  | "activity_ids"
  | "profile_ids"
  | "viewable_profile_ids"
  | "report_ids"
>;

/** Make a record visible to the given accounts (ignores non-mock users). */
export function share(
  list: ViewList,
  id: number,
  userIds: (number | null | undefined)[],
) {
  for (const userId of new Set(userIds)) {
    const view = userId == null ? undefined : viewOf(userId);
    if (view && !view[list].includes(id)) view[list].push(id);
  }
}

export function logActivity(
  actorId: number,
  message: string,
  workId: number | null,
) {
  const entry: Activity = {
    id: nextId(db.activity),
    actor_id: actorId,
    work_item_id: workId,
    message,
    created_at: now(),
  };
  db.activity.unshift(entry);
  const audience = Object.entries(db.views)
    .filter(
      ([id, v]) =>
        Number(id) === actorId ||
        (workId !== null && v.work_ids.includes(workId)),
    )
    .map(([id]) => Number(id));
  share("activity_ids", entry.id, audience);
}

export function notify(
  userId: number | null | undefined,
  message: string,
  extra: Partial<Pick<Notice, "work_item_id" | "update_request_id">> = {},
) {
  if (userId == null || !viewOf(userId)) return;
  db.notifications.unshift({
    id: nextId(db.notifications),
    user_id: userId,
    message,
    work_item_id: extra.work_item_id ?? null,
    update_request_id: extra.update_request_id ?? null,
    read: false,
    created_at: now(),
  });
}

export function withCapacity(p: Person): Person {
  const usable = Math.max(0, p.weekly_hours - p.reserved_hours);
  const available = p.capacity.confirmed
    ? Math.max(0, usable - p.capacity.committed)
    : null;
  return {
    ...p,
    capacity: {
      ...p.capacity,
      usable,
      available,
      estimated_available: Math.max(0, usable - p.capacity.committed),
      state:
        available === null
          ? "Unconfirmed"
          : available <= 0
            ? "Fully allocated"
            : "Available",
    },
  };
}

// ---------------------------------------------------------------- read models

const toWork = (w: Omit<Work, "can_edit">, view: View): Work => ({
  ...w,
  can_edit: view.editable_work_ids.includes(w.id),
});

const toDirectory = (
  p: Omit<DirectoryPerson, "can_view_profile">,
  view: View,
): DirectoryPerson => ({
  ...p,
  can_view_profile: view.viewable_profile_ids.includes(p.id),
});

export function stateFor(userId: number): WorkspaceState {
  const view = viewOf(userId);
  const has = (ids: number[]) => (row: { id: number }) => ids.includes(row.id);
  return {
    user: employee(userId)!,
    today: db.meta.today,
    demo_mode: db.meta.demo_mode,
    organization_source: db.meta.organization_source,
    assistant_connected: db.meta.assistant_connected,
    teams: db.teams,
    directory: db.directory.map((p) => toDirectory(p, view)),
    profile_ids: view.profile_ids,
    report_ids: view.report_ids,
    can_manage_org: view.can_manage_org,
    health: view.health,
    employees: db.employees.filter(has(view.employee_ids)),
    projects: db.projects.filter(has(view.project_ids)),
    work: db.work.filter(has(view.work_ids)).map((w) => toWork(w, view)),
    dependencies: db.dependencies.filter(has(view.dependency_ids)),
    activity: db.activity.filter(has(view.activity_ids)).slice(0, 100),
    notifications: db.notifications
      .filter((n) => n.user_id === userId)
      .map(({ user_id: _owner, ...n }) => n),
  };
}

export function profileFor(viewerId: number, personId: number): Profile | null {
  const view = viewOf(viewerId);
  const person = employee(personId);
  if (!person || !view.profile_ids.includes(personId)) return null;
  const work = db.work
    .filter((w) => w.owner_id === personId)
    .map((w) => toWork(w, view));
  const managerRow = db.directory.find((p) => p.id === person.manager_id);
  return {
    person,
    manager: managerRow ? toDirectory(managerRow, view) : null,
    reports: db.directory
      .filter((p) => p.manager_id === personId)
      .map((p) => toDirectory(p, view)),
    work,
    health: summarizeHealth(work),
    dependencies: db.dependencies.filter(
      (d) => d.owner_id === personId || d.requester_id === personId,
    ),
    activity: db.activity.filter((a) => a.actor_id === personId).slice(0, 30),
    can_manage: view.can_manage_org,
  };
}

export function requestsFor(userId: number): UpdateRequest[] {
  return db.updateRequests
    .filter((r) => r.requester_id === userId || r.recipient_id === userId)
    .map((r) => ({
      ...r,
      can_reply: r.recipient_id === userId && r.status === "Delivered",
    }));
}
