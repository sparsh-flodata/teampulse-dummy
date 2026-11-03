import { Link2, ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { isManager, openDependency } from "@/features/workspace/domain";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type {
  Dependency,
  Work,
  WorkspaceState,
} from "@/features/workspace/types";
import { updateDependency } from "../api";

export function DependencyCard({
  dep,
  state,
  onWork,
  compact = false,
}: {
  dep: Dependency;
  state: WorkspaceState;
  onWork: (w: Work) => void;
  compact?: boolean;
}) {
  const change = useWorkspaceMutation(updateDependency, (_, vars) =>
    vars.status === "Delivered"
      ? "Delivered. The requester can now verify it."
      : "Dependency updated.",
  );
  const busy = change.isPending;
  const set = (status: string) => change.mutate({ id: dep.id, status });
  const owner = state.directory.find((p) => p.id === dep.owner_id),
    requester = state.directory.find((p) => p.id === dep.requester_id),
    work = state.work.find((w) => w.id === dep.work_item_id);
  return (
    <div
      className={
        "dependency-card tone-" + dep.tone + " " + (compact ? "compact" : "")
      }
    >
      <div className="split">
        <span className="eyebrow">
          <Link2 size={13} />
          {dep.impact} impact
        </span>
        <Badge value={dep.status} />
      </div>
      <button className="dependency-title" onClick={() => work && onWork(work)}>
        {dep.deliverable}
        <ArrowUpRight size={15} />
      </button>
      <p>{dep.reason || "A required deliverable for " + work?.title}</p>
      <div className="dependency-people">
        <div>
          <Avatar person={owner} size={27} />
          <span>
            {owner?.name.split(" ")[0]}
            <small>Delivering</small>
          </span>
        </div>
        <ArrowRight size={15} />
        <div>
          <Avatar person={requester} size={27} />
          <span>
            {requester?.name.split(" ")[0]}
            <small>Waiting</small>
          </span>
        </div>
        <span className="dependency-date">
          {dateLabel(dep.due_date, state.today)}
        </span>
      </div>
      {!compact && (
        <>
          <div className="dep-impact">
            <span>
              {dep.partial ? "Other work can continue" : "Work cannot continue"}
            </span>
            <span>{dep.downstream_count} further downstream</span>
          </div>
          {openDependency(dep) && (
            <div className="dep-actions">
              {state.user.id === dep.owner_id && dep.status !== "Delivered" && (
                <>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      set(
                        dep.status === "Requested" ? "Accepted" : "In Progress",
                      )
                    }
                  >
                    {dep.status === "Requested" ? "Acknowledge" : "In progress"}
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => set("Delivered")}
                  >
                    <Check size={13} />
                    Mark delivered
                  </button>
                </>
              )}
              {state.user.id === dep.requester_id &&
                dep.status === "Delivered" && (
                  <button
                    className="button primary small"
                    disabled={busy}
                    onClick={() => set("Verified")}
                  >
                    <Check size={13} />
                    Verify deliverable
                  </button>
                )}
              {(state.user.id === dep.requester_id ||
                isManager(state.user)) && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => set("Cancelled")}
                >
                  Cancel dependency
                </button>
              )}
            </div>
          )}
        </>
      )}
      {change.error && <p className="error">{change.error.message}</p>}
    </div>
  );
}
