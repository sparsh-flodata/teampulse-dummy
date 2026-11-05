// Files and links sent with updates (plan 9.3). Offline mode has no Google
// Chat, so the fixture is a few links derived from the viewer's visible work,
// plus one uploaded screenshot that cannot be opened.
import { http, HttpResponse } from "msw";
import type { Attachment, AttachmentPage } from "@/features/attachments/types";
import { db, employee, reloadDb, viewOf } from "../db";
import { API, authUser, unauthorized } from "../http";

const HOUR = 3_600_000;

function fixtureFor(userId: number): Attachment[] {
  const view = viewOf(userId);
  if (!view) return [];
  const work = db.work
    .filter((w) => view.work_ids.includes(w.id) && w.owner_id)
    .slice(0, 4);
  const base = Date.now();
  return work.map((w, i) => {
    const owner = employee(w.owner_id);
    const project = db.projects.find((p) => p.id === w.project_id);
    const upload = i === 1;
    return {
      id: 100 + i,
      kind: upload ? "chat_upload" : "link",
      name: upload ? "screenshot.png" : `docs.example.com/${w.id}`,
      content_type: upload ? "image/png" : "",
      note: "",
      created_at: new Date(base - i * 20 * HOUR).toISOString(),
      work_item_id: w.id,
      project_id: w.project_id,
      employee_id: w.owner_id!,
      check_in_id: null,
      update_request_id: null,
      employee_name: owner?.name ?? "Former teammate",
      employee_color: owner?.color ?? "#5b6f8f",
      work_title: w.title,
      project_name: project?.name ?? "",
      project_color: project?.color ?? "#7256df",
      // Mock uploads have no bytes behind them, so they cannot be opened.
      can_open: !upload,
      open_url: upload ? null : `https://docs.example.com/${w.id}`,
      thumbnail_url: null,
    };
  });
}

export const attachmentHandlers = [
  http.get(`${API}/attachments`, ({ request }) => {
    reloadDb();
    const userId = authUser(request);
    if (userId === null) return unauthorized();
    const params = new URL(request.url).searchParams;
    const n = (key: string) =>
      params.has(key) ? Number(params.get(key)) : null;
    const project = n("project_id"),
      work = n("work_item_id"),
      person = n("person_id"),
      team = n("team_id"),
      kind = params.get("kind");
    const items = fixtureFor(userId).filter(
      (a) =>
        (project === null || a.project_id === project) &&
        (work === null || a.work_item_id === work) &&
        (person === null || a.employee_id === person) &&
        (team === null || employee(a.employee_id)?.team_id === team) &&
        (!kind || (kind === "links" ? a.kind === "link" : a.kind !== "link")),
    );
    return HttpResponse.json<AttachmentPage>({ items, next: null });
  }),
];
