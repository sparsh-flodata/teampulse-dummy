// Update requests and the (canned, offline) Pulse assistant.
import { http, HttpResponse } from "msw";
import type { AgentAction, UpdateRequest } from "@/features/workspace/types";
import {
  db,
  employee,
  logActivity,
  nextId,
  notify,
  now,
  requestsFor,
  viewOf,
} from "../db";
import { API, fail, saved } from "../http";
import { applyWorkUpdate, authed, id, num, str } from "./workspace";

const REQUEST_PROMPT =
  "Please share a brief update on your current work, expected completion, and any blockers.";

function conversation(userId: number) {
  return (db.conversations[userId] ??= { messages: [], actions: [] });
}

const names = (ids: number[]) => {
  const list = ids.map((i) => employee(i)?.name ?? "a teammate");
  return list.length > 4
    ? list.slice(0, 4).join(", ") + ` and ${list.length - 4} more`
    : list.join(", ");
};

/** Deterministic stand-in for the offline planner. */
function plan(
  userId: number,
  message: string,
  workId: number | null,
  recipients: number[],
) {
  const view = viewOf(userId);
  const text = message.toLowerCase();
  let action: AgentAction | null = null;
  let reply: string;

  const wantsUpdates =
    recipients.length > 0 ||
    (/\b(ask|request)\b/.test(text) && text.includes("update"));
  if (wantsUpdates) {
    const ids = recipients.length
      ? recipients.filter((r) => view.profile_ids.includes(r))
      : db.directory
          .filter((p) => p.manager_id === userId && p.active)
          .map((p) => p.id);
    if (!ids.length) {
      reply =
        "Mention a teammate from your reporting team to request an update.";
    } else {
      action = {
        id: nextId(Object.values(db.conversations).flatMap((c) => c.actions)),
        status: "Proposed",
        payload: {
          kind: "request_updates",
          recipient_ids: ids,
          request_prompt: REQUEST_PROMPT,
          channel: "in_app",
          work_item_id: null,
          note: "",
        },
      };
      reply = `I can request updates from ${names(ids)}. Confirm below to deliver the request to their TeamPulse inbox and, where they have connected it, Google Chat.`;
    }
  } else if (text.includes("summar")) {
    const own = db.work.filter(
      (w) => w.owner_id === userId && w.status !== "Completed",
    );
    reply = own.length
      ? "Your current commitments:\n" +
        own
          .map(
            (w) =>
              `• ${w.title}: ${w.status}, ${w.remaining_hours}h remaining.`,
          )
          .join("\n") +
        "\n\nCapacity and dates are estimates until confirmed. Open a work item to review its dependencies."
      : "You have no active commitments recorded.";
  } else if (text.includes("blocked")) {
    const blocked = db.work.filter(
      (w) =>
        view.work_ids.includes(w.id) &&
        ["Blocked", "Partially Blocked"].includes(w.status),
    );
    reply = blocked.length
      ? "Recorded blockers:\n" +
        blocked
          .map(
            (w) =>
              `• ${w.title} (${employee(w.owner_id)?.name ?? "Unassigned"}): ${w.status}.`,
          )
          .join("\n")
      : "No matching commitments are recorded in your reporting scope.";
  } else if (workId && /(\d{1,3})\s*%/.test(text)) {
    const progress = Number(text.match(/(\d{1,3})\s*%/)![1]);
    const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hours?)\b/);
    action = {
      id: nextId(Object.values(db.conversations).flatMap((c) => c.actions)),
      status: "Proposed",
      payload: {
        kind: "update",
        work_item_id: workId,
        progress: Math.min(100, progress),
        remaining_hours: hours ? Number(hours[1]) : null,
        note: message,
      },
    };
    reply =
      "Review the proposed update below. Nothing changes until you confirm.";
  } else {
    reply =
      "I can summarize your week, draft a commitment, or update selected work. In offline mode, try “Summarize my commitments”, select a work item and say “65% complete, 4 hours remaining”, or ask a teammate for an update.";
  }
  return { reply, action };
}

export const coordinationHandlers = [
  http.get(
    `${API}/update-requests`,
    authed(({ userId }) => HttpResponse.json(requestsFor(userId))),
  ),

  http.post(
    `${API}/update-requests/:id/reply`,
    authed(({ userId, params, body }) => {
      const request = db.updateRequests.find((r) => r.id === id(params));
      if (!request || request.recipient_id !== userId)
        return fail(404, "Update request not found.");
      if (request.status !== "Delivered")
        return fail(409, "This request no longer accepts replies.");
      const message = str(body.message).trim();
      if (message.length < 3)
        return fail(422, "Your update must have at least 3 characters.");
      Object.assign(request, {
        response: message,
        status: "Responded",
        responded_at: now(),
        work_item_id: body.work_item_id == null ? null : num(body.work_item_id),
      });
      const work = db.work.find(
        (w) => w.id === request.work_item_id && w.owner_id === userId,
      );
      if (work) {
        applyWorkUpdate(work, {
          status: body.status || undefined,
          progress: body.progress,
          remaining_hours: body.remaining_hours,
        });
        logActivity(
          userId,
          `Shared an update with ${request.requester_name}: ${message}`,
          work.id,
        );
      }
      notify(
        request.requester_id,
        `${request.recipient_name} replied to your update request.`,
        {
          update_request_id: request.id,
        },
      );
      return HttpResponse.json(saved({ ok: true }));
    }),
  ),

  http.post(
    `${API}/update-requests/:id/cancel`,
    authed(({ userId, params }) => {
      const request = db.updateRequests.find((r) => r.id === id(params));
      if (!request || request.requester_id !== userId)
        return fail(404, "Update request not found.");
      request.status = "Cancelled";
      return HttpResponse.json(saved({ ok: true }));
    }),
  ),

  http.get(
    `${API}/assistant/history`,
    authed(({ userId }) => HttpResponse.json(conversation(userId))),
  ),

  http.post(
    `${API}/assistant/chat`,
    authed(({ userId, body }) => {
      const message = str(body.message).trim();
      if (!message) return fail(422, "Write a message first.");
      const convo = conversation(userId);
      const recipients = Array.isArray(body.recipient_ids)
        ? body.recipient_ids.map(Number)
        : [];
      const workId = body.work_item_id == null ? null : num(body.work_item_id);
      const { reply, action } = plan(userId, message, workId, recipients);
      convo.messages.push(
        { role: "user", message },
        { role: "assistant", message: reply },
      );
      if (action) convo.actions.unshift(action);
      return HttpResponse.json(
        saved({ reply, mode: "offline", auto_applied: false, action }),
      );
    }),
  ),

  http.post(
    `${API}/assistant/actions/:id/decide`,
    authed(({ userId, params, body }) => {
      const convo = conversation(userId);
      const action = convo.actions.find((a) => a.id === id(params));
      if (!action || action.status !== "Proposed")
        return fail(404, "This proposal is no longer available.");
      const approve = Boolean(body.approve);
      action.status = approve ? "Approved" : "Dismissed";
      if (!approve) return HttpResponse.json(saved({ status: action.status }));

      const payload = action.payload;
      if (payload.kind === "request_updates") {
        const me = employee(userId)!;
        const created: UpdateRequest[] = (
          payload.recipient_ids as number[]
        ).map((recipientId) => {
          const request = {
            id: nextId(db.updateRequests),
            requester_id: userId,
            recipient_id: recipientId,
            requester_name: me.name,
            recipient_name: employee(recipientId)?.name ?? "Teammate",
            prompt: String(payload.request_prompt),
            channel: "in_app",
            status: "Delivered",
            delivery_detail: "Delivered to the TeamPulse update inbox.",
            response: null,
            work_item_id: null,
            created_at: now(),
            responded_at: null,
            access_changed: false,
          };
          db.updateRequests.unshift(request);
          notify(recipientId, `${me.name} requested an update.`, {
            update_request_id: request.id,
          });
          return { ...request, can_reply: false };
        });
        convo.messages.push({
          role: "assistant",
          message: `${created.length} update request(s) delivered to TeamPulse inboxes.`,
        });
        return HttpResponse.json(
          saved({ status: action.status, requests: created }),
        );
      }
      const work = db.work.find((w) => w.id === Number(payload.work_item_id));
      if (work && viewOf(userId).editable_work_ids.includes(work.id)) {
        applyWorkUpdate(work, payload);
        logActivity(
          userId,
          `Confirmed an assistant update: ${work.progress}% complete.`,
          work.id,
        );
      }
      return HttpResponse.json(saved({ status: action.status }));
    }),
  ),
];
