import { http, HttpResponse, type PathParams } from "msw";
import type {
  Dependency,
  Person,
  Project,
  Team,
  Work,
} from "@/features/workspace/types";
import {
  adminIds,
  db,
  employee,
  logActivity,
  nextId,
  notify,
  now,
  profileFor,
  reloadDb,
  share,
  stateFor,
  viewOf,
  withCapacity,
} from "../db";
import { API, authUser, fail, invalid, saved, unauthorized } from "../http";

type Ctx = {
  userId: number;
  params: PathParams;
  request: Request;
  body: Record<string, unknown>;
};
type Handler = (ctx: Ctx) => Response | Promise<Response>;

/** Resolves the user from the Bearer token and parses the JSON body. */
function authed(handler: Handler) {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: PathParams;
  }) => {
    const body =
      request.method === "GET"
        ? {}
        : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
    // Read, mutate and persist synchronously from here on (no awaits), so a
    // request never acts on a copy another tab has since changed.
    reloadDb();
    const userId = authUser(request);
    if (userId === null) return unauthorized();
    return handler({ userId, params, body, request });
  };
}

const id = (params: PathParams, key = "id") => Number(params[key]);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const addDays = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function preferencesOf(userId: number) {
  const p = employee(userId);
  return {
    proactive_checkins: p?.proactive_checkins ?? true,
    checkins_paused_until: p?.checkins_paused_until ?? null,
    checkin_hour: 9,
    org_timezone: "Asia/Kolkata",
    enabled: true,
  };
}

/** Daily check-ins as the server would compose them for one day (weekdays only). */
function checkInsFor(date: string) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  if (weekday === 0 || weekday === 6) return [];
  const soon = addDays(date, 2);
  return db.employees
    .filter(
      (p) =>
        p.active &&
        p.proactive_checkins &&
        !(p.checkins_paused_until && date < p.checkins_paused_until),
    )
    .map((p) => ({
      person: p,
      work: db.work
        .filter(
          (w) =>
            w.owner_id === p.id &&
            w.status !== "Completed" &&
            w.due_date <= soon,
        )
        .slice(0, 5),
    }))
    .filter((x) => x.work.length)
    .slice(0, 8)
    .map(({ person, work }, i) => {
      const items = work.map((w, n) => ({
        n: n + 1,
        work_item_id: w.id,
        title: w.title,
      }));
      const lines = work.map(
        (w, n) =>
          `${n + 1}. **${w.title}**: ${w.due_date < date ? "was due" : "due"} ${w.due_date}, ${w.progress}% done`,
      );
      return {
        id: i + 1,
        employee_id: person.id,
        employee_name: person.name,
        kind: "daily",
        status: i % 3 === 0 ? "Answered" : "Open",
        period: date,
        clarify_rounds: i % 3 === 0 ? 1 : 0,
        items,
        message: [
          `Good morning ${person.name.split(" ")[0]}. A quick check on what you owe:`,
          lines.join("\n"),
          "Reply in your own words, for example `1 done, 2 moves to Friday`.",
        ].join("\n\n"),
        chat_delivery: i % 2 === 0 ? "Dry run" : "Not linked",
        created_at: date + "T03:30:00Z",
        expires_at: addDays(date, 1) + "T03:30:00Z",
      };
    });
}

const managerOnly = (userId: number) =>
  ["manager", "admin"].includes(employee(userId)?.role ?? "");

function applyWorkUpdate(
  work: Omit<Work, "can_edit">,
  body: Record<string, unknown>,
) {
  if (body.status) work.status = str(body.status);
  if (body.progress != null) work.progress = num(body.progress);
  if (body.remaining_hours != null)
    work.remaining_hours = num(body.remaining_hours);
  if (body.priority) work.priority = str(body.priority);
  if (work.status === "Completed") {
    Object.assign(work, {
      progress: 100,
      remaining_hours: 0,
      health: "Completed",
      tone: "green",
      health_reason: "The owner confirmed completion.",
      next_action: "No action needed.",
    });
  } else if (work.status === "Blocked" || work.status === "Partially Blocked") {
    Object.assign(work, {
      health: "Dependency at risk",
      tone: "amber",
      health_reason: "Recorded dependencies are preventing progress.",
      next_action: "Review the dependency and its owner.",
    });
  }
  work.confirmed_at = now();
}

export const workspaceHandlers = [
  http.get(
    `${API}/state`,
    authed(({ userId }) => HttpResponse.json(stateFor(userId))),
  ),

  // ------------------------------------------------------------- work
  http.post(
    `${API}/work`,
    authed(({ userId, body }) => {
      const title = str(body.title).trim();
      if (title.length < 3)
        return invalid("Title must have at least 3 characters.");
      const ownerId = body.owner_id == null ? null : num(body.owner_id);
      const own = ownerId === userId;
      const effort = num(body.effort_hours) || 0;
      const work: Omit<Work, "can_edit"> = {
        id: nextId(db.work),
        title,
        description: str(body.description),
        project_id: num(body.project_id),
        owner_id: ownerId,
        status: "Planned",
        priority: str(body.priority) || "Medium",
        progress: 0,
        remaining_hours: effort,
        required_skills: str(body.required_skills),
        risk: false,
        confirmed_at: own ? now() : null,
        health: own ? "On track" : "Progress unconfirmed",
        tone: own ? "green" : "neutral",
        health_reason: own
          ? "The owner confirmed this commitment."
          : "The owner has not confirmed this commitment yet.",
        next_action: own
          ? "Keep progress up to date."
          : "Ask the owner to confirm feasibility.",
        due_date: str(body.due_date) || db.meta.today,
        start_date: db.meta.today,
        effort_hours: effort,
        revision: 1,
        commitment_confirmed: own,
      };
      db.work.push(work);
      db.workHistory[work.id] = [
        {
          revision: 1,
          due_date: work.due_date,
          reason: "Initial commitment.",
          confirmed_by: userId,
        },
      ];
      const audience = [userId, ownerId, ...adminIds()];
      share("work_ids", work.id, audience);
      share("editable_work_ids", work.id, audience);
      logActivity(userId, `Created commitment: ${title}.`, work.id);
      if (ownerId && !own)
        notify(
          ownerId,
          `${employee(userId)?.name} proposed “${title}” for you. Confirm it is feasible.`,
          {
            work_item_id: work.id,
          },
        );
      return HttpResponse.json(saved({ ...work, can_edit: true }), {
        status: 201,
      });
    }),
  ),

  http.patch(
    `${API}/work/:id`,
    authed(({ userId, params, body }) => {
      const work = db.work.find((w) => w.id === id(params));
      if (!work) return fail(404, "Work item not found.");
      if (!viewOf(userId).editable_work_ids.includes(work.id))
        return fail(
          403,
          "Only the owner or their reporting managers can update this work.",
        );
      const due = str(body.due_date);
      if (due && due !== work.due_date) {
        work.due_date = due;
        work.revision += 1;
        (db.workHistory[work.id] ??= []).push({
          revision: work.revision,
          due_date: due,
          reason: str(body.note) || "Expected completion revised.",
          confirmed_by: userId,
        });
      }
      if (body.accept_commitment) work.commitment_confirmed = true;
      applyWorkUpdate(work, body);
      const note = str(body.note).trim();
      logActivity(
        userId,
        `Updated progress to ${work.progress}% · ${work.status}.${note ? " " + note : ""}`,
        work.id,
      );
      return HttpResponse.json(saved({ ...work, can_edit: true }));
    }),
  ),

  http.get(
    `${API}/work/:id/history`,
    authed(({ params }) => {
      const work = db.work.find((w) => w.id === id(params));
      if (!work) return fail(404, "Work item not found.");
      return HttpResponse.json(
        db.workHistory[work.id] ?? [
          {
            revision: 1,
            due_date: work.due_date,
            reason: "Agreed demo milestone and acceptance criteria.",
          },
        ],
      );
    }),
  ),

  http.post(
    `${API}/work/:id/assign`,
    authed(({ userId, params, body }) => {
      if (!managerOnly(userId)) return fail(403, "Manager access is required.");
      const work = db.work.find((w) => w.id === id(params));
      const assignee = employee(num(body.employee_id));
      if (!work || !assignee)
        return fail(404, "Work item or employee not found.");
      Object.assign(work, {
        owner_id: assignee.id,
        commitment_confirmed: false,
        health: "Progress unconfirmed",
        tone: "neutral",
        health_reason: "The proposed owner has not confirmed feasibility.",
        next_action: "Wait for the employee to confirm the commitment.",
      });
      share("work_ids", work.id, [assignee.id]);
      share("editable_work_ids", work.id, [assignee.id]);
      logActivity(userId, `Proposed ${assignee.name} as owner.`, work.id);
      notify(
        assignee.id,
        `You were proposed as the owner of “${work.title}”. Confirm it is feasible.`,
        {
          work_item_id: work.id,
        },
      );
      return HttpResponse.json(saved({ ok: true }));
    }),
  ),

  // ------------------------------------------------------------- projects & people
  http.post(
    `${API}/projects`,
    authed(({ userId, body }) => {
      if (!managerOnly(userId)) return fail(403, "Manager access is required.");
      const name = str(body.name).trim();
      if (name.length < 2)
        return invalid("Project name must have at least 2 characters.");
      const project: Project = {
        id: nextId(db.projects),
        name,
        description: str(body.description),
        team_id: num(body.team_id),
        color: str(body.color) || "#7256df",
        member_ids: [userId],
        health: {
          tone: "neutral",
          label: "Confirmation needed",
          counts: { green: 0, amber: 0, red: 0, neutral: 0 },
          active: 0,
          completed: 0,
        },
      };
      db.projects.push(project);
      share("project_ids", project.id, Object.keys(db.views).map(Number));
      return HttpResponse.json(saved(project), { status: 201 });
    }),
  ),

  http.post(
    `${API}/employees`,
    authed(({ userId, body }) => {
      if (!managerOnly(userId)) return fail(403, "Manager access is required.");
      const email = str(body.email).trim().toLowerCase();
      if (db.employees.some((p) => p.email === email))
        return fail(
          409,
          "This record already exists or changed concurrently. Refresh and try again.",
        );
      if (str(body.password).length < 12)
        return invalid("Password must have at least 12 characters.");
      const personId = nextId(db.employees);
      const role =
        str(body.role) === "manager" && viewOf(userId).can_manage_org
          ? "manager"
          : "employee";
      const person: Person = withCapacity({
        id: personId,
        name: str(body.name).trim(),
        email,
        title: str(body.title) || "Team member",
        role,
        team_id: num(body.team_id),
        manager_id: body.manager_id == null ? userId : num(body.manager_id),
        skills: str(body.skills),
        color: "#7256df",
        weekly_hours: 40,
        reserved_hours: 10,
        planning: "Hybrid",
        active: true,
        agent_auto_updates: false,
        proactive_checkins: true,
        checkins_paused_until: null,
        capacity: {
          committed: 0,
          usable: 30,
          available: null,
          estimated_available: 30,
          state: "Unconfirmed",
          confirmed: false,
          blocked_count: 0,
          utilization: 0,
        },
      });
      db.employees.push(person);
      db.directory.push({
        id: personId,
        name: person.name,
        title: person.title,
        role,
        team_id: person.team_id,
        manager_id: person.manager_id,
        color: person.color,
        active: true,
        direct_reports: 0,
      });
      const audience = [userId, person.manager_id, ...adminIds()];
      for (const list of [
        "employee_ids",
        "profile_ids",
        "viewable_profile_ids",
      ] as const)
        share(list, personId, audience);
      share("report_ids", personId, [person.manager_id]);
      return HttpResponse.json(saved(person), { status: 201 });
    }),
  ),

  http.patch(
    `${API}/employees/:id`,
    authed(({ userId, params, body }) => {
      if (!viewOf(userId).can_manage_org)
        return fail(403, "Administrator access is required.");
      const personId = id(params);
      const row = db.directory.find((p) => p.id === personId);
      const person = employee(personId);
      if (!row || !person) return fail(404, "Person not found.");
      const patch = {
        name: str(body.name) || row.name,
        title: str(body.title) || row.title,
        team_id: num(body.team_id) || row.team_id,
        manager_id: body.manager_id == null ? null : num(body.manager_id),
        role: str(body.role) || row.role,
        active: Boolean(body.active),
      };
      if (patch.manager_id === personId)
        return invalid("A person cannot report to themselves.");
      Object.assign(row, patch);
      Object.assign(person, patch);
      return HttpResponse.json(saved({ ok: true }));
    }),
  ),

  http.patch(
    `${API}/me/availability`,
    authed(({ userId, body }) => {
      const index = db.employees.findIndex((p) => p.id === userId);
      const p = db.employees[index];
      db.employees[index] = withCapacity({
        ...p,
        weekly_hours: num(body.weekly_hours),
        reserved_hours: num(body.reserved_hours),
        planning: str(body.planning) || p.planning,
        agent_auto_updates: Boolean(body.agent_auto_updates),
        capacity: {
          ...p.capacity,
          confirmed: Boolean(body.capacity_confirmed),
        },
      });
      return HttpResponse.json(saved(db.employees[index]));
    }),
  ),

  // ------------------------------------------------------------- check-ins
  http.get(
    `${API}/me/preferences`,
    authed(({ userId }) => HttpResponse.json(preferencesOf(userId))),
  ),

  http.patch(
    `${API}/me/preferences`,
    authed(({ userId, body }) => {
      const p = employee(userId);
      if (!p) return unauthorized();
      if (typeof body.proactive_checkins === "boolean")
        p.proactive_checkins = body.proactive_checkins;
      if (typeof body.pause_until_tomorrow === "boolean")
        p.checkins_paused_until = body.pause_until_tomorrow
          ? addDays(db.meta.today, 1)
          : null;
      return HttpResponse.json(saved(preferencesOf(userId)));
    }),
  ),

  http.get(
    `${API}/admin/check-ins`,
    authed(({ userId, request }) => {
      if (employee(userId)?.role !== "admin")
        return fail(403, "Administrator access is required.");
      const date =
        new URL(request.url).searchParams.get("date") || db.meta.today;
      return HttpResponse.json({
        date,
        enabled: true,
        dry_run: true,
        check_ins: checkInsFor(date),
      });
    }),
  ),

  http.get(
    `${API}/people/:id/profile`,
    authed(({ userId, params }) => {
      const profile = profileFor(userId, id(params));
      return profile
        ? HttpResponse.json(profile)
        : fail(
            403,
            "Full work profiles are limited to yourself and your reporting team.",
          );
    }),
  ),

  // ------------------------------------------------------------- organization
  http.post(
    `${API}/teams`,
    authed(({ userId, body }) => {
      if (!viewOf(userId).can_manage_org)
        return fail(403, "Administrator access is required.");
      const team: Team = {
        id: nextId(db.teams),
        name: str(body.name).trim(),
        parent_id: body.parent_id == null ? null : num(body.parent_id),
        lead_id: body.lead_id == null ? null : num(body.lead_id),
      };
      db.teams.push(team);
      return HttpResponse.json(saved(team), { status: 201 });
    }),
  ),

  http.patch(
    `${API}/teams/:id`,
    authed(({ userId, params, body }) => {
      if (!viewOf(userId).can_manage_org)
        return fail(403, "Administrator access is required.");
      const team = db.teams.find((t) => t.id === id(params));
      if (!team) return fail(404, "Department not found.");
      const parentId = body.parent_id == null ? null : num(body.parent_id);
      if (parentId === team.id)
        return invalid("A department cannot be its own parent.");
      Object.assign(team, {
        name: str(body.name).trim() || team.name,
        parent_id: parentId,
        lead_id: body.lead_id == null ? null : num(body.lead_id),
      });
      return HttpResponse.json(saved(team));
    }),
  ),

  // ------------------------------------------------------------- dependencies
  http.post(
    `${API}/dependencies`,
    authed(({ userId, body }) => {
      const work = db.work.find((w) => w.id === num(body.work_item_id));
      if (!work) return fail(404, "Work item not found.");
      const deliverable = str(body.deliverable).trim();
      if (deliverable.length < 3)
        return invalid("Deliverable must have at least 3 characters.");
      const partial = Boolean(body.partial);
      const dep: Dependency = {
        id: nextId(db.dependencies),
        work_item_id: work.id,
        upstream_work_id:
          body.upstream_work_id == null ? null : num(body.upstream_work_id),
        requester_id: userId,
        owner_id: num(body.owner_id),
        deliverable,
        reason: str(body.reason),
        due_date: str(body.due_date) || db.meta.today,
        impact: str(body.impact) || "High",
        partial,
        status: "Requested",
        downstream_count: 0,
        tone: "amber",
      };
      db.dependencies.push(dep);
      share("dependency_ids", dep.id, [userId, dep.owner_id, ...adminIds()]);
      applyWorkUpdate(work, {
        status: partial ? "Partially Blocked" : "Blocked",
      });
      logActivity(userId, `Recorded a dependency: ${deliverable}.`, work.id);
      notify(
        dep.owner_id,
        `${employee(userId)?.name} needs “${deliverable}” from you.`,
        {
          work_item_id: work.id,
        },
      );
      return HttpResponse.json(saved(dep), { status: 201 });
    }),
  ),

  http.patch(
    `${API}/dependencies/:id`,
    authed(({ userId, params, body }) => {
      const dep = db.dependencies.find((d) => d.id === id(params));
      if (!dep) return fail(404, "Dependency not found.");
      const status = str(body.status);
      dep.status = status;
      dep.tone =
        status === "Verified"
          ? "green"
          : status === "Cancelled"
            ? "neutral"
            : dep.tone;
      logActivity(userId, `Dependency: ${status}.`, dep.work_item_id);
      if (status === "Delivered")
        notify(
          dep.requester_id,
          `“${dep.deliverable}” was delivered. Verify that it works.`,
          {
            work_item_id: dep.work_item_id,
          },
        );
      return HttpResponse.json(saved(dep));
    }),
  ),

  // ------------------------------------------------------------- notifications
  http.post(
    `${API}/notifications/:id/read`,
    authed(({ userId, params }) => {
      const notice = db.notifications.find(
        (n) => n.id === id(params) && n.user_id === userId,
      );
      if (!notice) return fail(404, "Notification not found.");
      notice.read = true;
      return HttpResponse.json(saved({ ok: true }));
    }),
  ),
];

export { authed, applyWorkUpdate, str, num, id };
