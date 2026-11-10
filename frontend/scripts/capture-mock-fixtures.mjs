// Captures a snapshot of the legacy TeamPulse API and normalizes it into the
// MSW mock seed (src/mocks/fixtures/seed.json).
//
// Usage (with the legacy backend running and seeded):
//   node scripts/capture-mock-fixtures.mjs http://127.0.0.1:8787
//
// The backend's origin check requires an allowed Origin header; set
// CAPTURE_ORIGIN if your ALLOWED_ORIGINS differ from the defaults.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const ORIGIN = process.env.CAPTURE_ORIGIN || "http://127.0.0.1:8787";
const PASSWORD = process.env.DEMO_PASSWORD || "TeamPulse-demo-2026!";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/mocks/fixtures/seed.json",
);
const ACCOUNTS = [
  "ujjwal@flodataanalytics.com",
  "nitish.kumar@flodataanalytics.com",
  "kapil.sharma@flodataanalytics.com",
];
const headers = {
  "Content-Type": "application/json",
  "X-TeamPulse-Request": "1",
  Origin: ORIGIN,
};

async function signIn(email) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: ${res.status}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const get = async (p) => {
    const r = await fetch(BASE + p, {
      headers: { ...headers, Cookie: cookie },
    });
    if (!r.ok) throw new Error(`GET ${p} failed: ${r.status}`);
    return r.json();
  };
  return { user: await res.json(), get };
}

const byId = new Map();
const upsert = (table, rows, omit = []) => {
  const map = byId.get(table) ?? new Map();
  for (const row of rows) {
    const copy = { ...row };
    for (const k of omit) delete copy[k];
    map.set(copy.id, copy);
  }
  byId.set(table, map);
};
const sorted = (table) =>
  [...(byId.get(table)?.values() ?? [])].sort((a, b) => a.id - b.id);

const seed = {
  meta: null,
  accounts: [],
  views: {},
  notifications: [],
  workHistory: {},
  conversations: {},
};

for (const email of ACCOUNTS) {
  const { user, get } = await signIn(email);
  const state = await get("/api/state");
  seed.meta ??= {
    today: state.today,
    demo_mode: !!state.demo_mode,
    organization_source: state.organization_source ?? null,
    assistant_connected: state.assistant_connected,
  };
  seed.accounts.push({ user_id: user.id, email: user.email });
  upsert("teams", state.teams);
  upsert("directory", state.directory, ["can_view_profile"]);
  upsert("employees", state.employees);
  upsert("projects", state.projects);
  upsert("work", state.work, ["can_edit"]);
  upsert("dependencies", state.dependencies);
  upsert("activity", state.activity);
  upsert("updateRequests", await get("/api/update-requests"), ["can_reply"]);
  for (const n of state.notifications)
    seed.notifications.push({ ...n, user_id: user.id });

  const viewable = state.directory
    .filter((p) => p.can_view_profile)
    .map((p) => p.id);
  seed.views[user.id] = {
    profile_ids: state.profile_ids,
    report_ids: state.report_ids,
    viewable_profile_ids: viewable,
    can_manage_org: state.can_manage_org,
    health: state.health,
    work_ids: state.work.map((w) => w.id),
    editable_work_ids: state.work.filter((w) => w.can_edit).map((w) => w.id),
    employee_ids: state.employees.map((p) => p.id),
    project_ids: state.projects.map((p) => p.id),
    dependency_ids: state.dependencies.map((d) => d.id),
    activity_ids: state.activity.map((a) => a.id),
  };
  const history = await get("/api/assistant/history");
  seed.conversations[user.id] = {
    messages: history.messages ?? [],
    actions: history.actions ?? [],
  };
  for (const w of state.work)
    if (!seed.workHistory[w.id])
      seed.workHistory[w.id] = await get(`/api/work/${w.id}/history`);
}

Object.assign(seed, {
  teams: sorted("teams"),
  directory: sorted("directory"),
  employees: sorted("employees"),
  projects: sorted("projects"),
  work: sorted("work"),
  dependencies: sorted("dependencies"),
  activity: sorted("activity").reverse(),
  updateRequests: sorted("updateRequests").reverse(),
});
seed.notifications.sort((a, b) => b.id - a.id);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(seed));
console.log(`Wrote ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
for (const k of [
  "teams",
  "directory",
  "employees",
  "projects",
  "work",
  "dependencies",
  "activity",
  "updateRequests",
  "notifications",
])
  console.log(k.padEnd(15), seed[k].length);
