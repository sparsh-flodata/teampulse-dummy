import { Sparkles, Check, Link2 } from "lucide-react";
import { Avatar } from "@/components/ui";
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
};
const HIDDEN = ["kind", "note", "recipient_ids", "request_prompt", "channel"];

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
        {request ? "REVIEW UPDATE REQUEST" : "REVIEW PROPOSED WORK CHANGE"}
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
          <p className="proposal-request-message">
            {String(payload.request_prompt)}
          </p>
          <small>
            <Link2 size={12} />
            {payload.channel === "whatsapp"
              ? "WhatsApp is not configured. This will queue without sending."
              : "Delivery: TeamPulse in-app inbox"}
          </small>
        </>
      ) : (
        <>
          <h3>
            {payload.kind === "create" ? "New commitment" : "Update your work"}
          </h3>
          {Object.entries(payload)
            .filter(([k, v]) => v !== null && v !== "" && !HIDDEN.includes(k))
            .map(([k, v]) => (
              <div className="proposal-field" key={k}>
                <span>{FIELD_LABELS[k] || k}</span>
                <strong>
                  {k === "work_item_id"
                    ? state.work.find((w) => w.id === Number(v))?.title
                    : k === "project_id"
                      ? state.projects.find((p) => p.id === Number(v))?.name
                      : k === "progress"
                        ? v + "%"
                        : k.endsWith("hours")
                          ? v + "h"
                          : String(v)}
                </strong>
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
