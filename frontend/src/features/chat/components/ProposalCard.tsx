import { Sparkles, Check, Link2 } from "lucide-react";
import { Avatar } from "@/components/ui";
import { RichText } from "@/components/ui/RichText";
import { dateLabel } from "@/lib/format";
import type { AgentAction, WorkspaceState } from "@/features/workspace/types";

const FIELD_LABELS: Record<string, string> = {
  work_item_id: "Commitment",
  title: "Deliverable",
  project_id: "Project",
  due_date: "Expected completion",
  progress: "Progress",
  effort_hours: "Estimated effort",
  remaining_hours: "Remaining effort",
  status: "Status",
  risk: "Risk",
  owner_id: "Waiting on",
  deliverable: "Needs",
  partial: "Blocking",
};
// Fields shown, in this order; anything else in the payload is internal.
const ORDER = [
  "work_item_id",
  "title",
  "project_id",
  "status",
  "progress",
  "remaining_hours",
  "effort_hours",
  "due_date",
  "risk",
  "owner_id",
  "deliverable",
  "partial",
  "note",
];

/** Heading for a work proposal, from what it changes. */
function titleOf(payload: Record<string, unknown>) {
  if (payload.kind === "create") return "New commitment";
  if (payload.kind === "dependency") return "Record a dependency";
  if (payload.kind !== "update") return "Proposed change";
  if (payload.status === "Completed") return "Mark as complete";
  if (payload.risk === true) return "Flag a risk";
  if (payload.due_date) return "Move the expected date";
  return "Update your work";
}

function labelOf(key: string, payload: Record<string, unknown>) {
  if (key === "due_date" && payload.kind === "dependency") return "Needed by";
  if (key === "note")
    return payload.kind === "dependency" || payload.risk !== true
      ? "Reason"
      : "Blocker";
  return FIELD_LABELS[key] ?? key;
}

/** The note explains a blocker, a dependency or a date move; elsewhere it echoes the chat message. */
const showsNote = (payload: Record<string, unknown>) =>
  payload.kind === "dependency" ||
  (payload.kind === "update" &&
    (payload.risk === true ||
      (Boolean(payload.due_date) && payload.status !== "Completed")));

function valueOf(key: string, v: unknown, state: WorkspaceState) {
  switch (key) {
    case "work_item_id":
      return state.work.find((w) => w.id === Number(v))?.title ?? "Unknown";
    case "owner_id":
      return state.directory.find((p) => p.id === Number(v))?.name ?? "Unknown";
    case "project_id":
      return state.projects.find((p) => p.id === Number(v))?.name ?? "Unknown";
    case "partial":
      return v ? "Partly, other work can continue" : "Fully";
    case "risk":
      return v ? "Mark as at risk" : "Clear the risk flag";
    case "due_date":
      return dateLabel(String(v));
    case "progress":
      return v + "%";
    case "effort_hours":
    case "remaining_hours":
      return v + "h";
    default:
      return String(v);
  }
}

export function ProposalCard({
  action,
  state,
  busy,
  decide,
}: {
  action: AgentAction;
  state: WorkspaceState;
  busy: boolean;
  decide: (approve: boolean) => void;
}) {
  const payload = action.payload,
    request = payload.kind === "request_updates";
  const ids = Array.isArray(payload.recipient_ids)
    ? payload.recipient_ids.map(Number)
    : [];
  return (
    <div className="coord-proposal">
      <span className="eyebrow">
        <Sparkles size={13} />
        {request ? "Review update request" : "Review proposed work change"}
      </span>
      {request ? (
        <>
          <h3>
            Ask {ids.length} teammate{ids.length === 1 ? "" : "s"} for an update
          </h3>
          <div className="proposal-people">
            {ids.map((id) => {
              const person = state.directory.find((p) => p.id === id);
              return (
                <span key={id}>
                  <Avatar person={person} size={21} />
                  {person?.name}
                </span>
              );
            })}
          </div>
          <RichText
            className="proposal-request-message"
            text={String(payload.request_prompt ?? "")}
          />
          <small>
            <Link2 size={12} />
            {payload.channel === "google_chat"
              ? "Delivery: TeamPulse inbox, plus Google Chat for people who connected it"
              : "Delivery: TeamPulse in-app inbox"}
          </small>
        </>
      ) : (
        <>
          <h3>{titleOf(payload)}</h3>
          {ORDER.filter((k) => {
            const v = payload[k];
            if (v === null || v === undefined || v === "") return false;
            if (k === "note") return showsNote(payload);
            return k !== "partial" || payload.kind === "dependency";
          }).map((k) => (
            <div
              className={
                "proposal-field" + (k === "risk" && payload[k] ? " risk" : "")
              }
              key={k}
            >
              <span>{labelOf(k, payload)}</span>
              <strong>{valueOf(k, payload[k], state)}</strong>
            </div>
          ))}
        </>
      )}
      <div className="proposal-controls">
        <button
          className="button small"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Dismiss
        </button>
        <button
          className="button primary small"
          disabled={busy}
          onClick={() => decide(true)}
        >
          <Check size={14} />
          {request ? "Request updates" : "Confirm & save"}
        </button>
      </div>
    </div>
  );
}
