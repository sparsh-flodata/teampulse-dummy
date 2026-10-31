import { useState } from "react";
import { Link2, ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { Avatar, Badge } from "../../components/ui";
import {
  api,
  State,
  Work,
  Dependency,
  dateLabel,
  isManager,
  openDependency,
} from "../../lib";

export function DependencyCard({
  dep,
  state,
  onWork,
  onRefresh,
  compact = false,
}: {
  dep: Dependency;
  state: State;
  onWork: (w: Work) => void;
  onRefresh: (message: string) => Promise<void>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const owner = state.directory.find((p) => p.id === dep.owner_id),
    requester = state.directory.find((p) => p.id === dep.requester_id),
    work = state.work.find((w) => w.id === dep.work_item_id);
  async function change(status: string) {
    setBusy(true);
    setError("");
    try {
      await api("/dependencies/" + dep.id, { status }, "PATCH");
      await onRefresh(
        status === "Delivered"
          ? "Delivered. The requester can now verify it."
          : "Dependency updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
                      change(
                        dep.status === "Requested" ? "Accepted" : "In Progress",
                      )
                    }
                  >
                    {dep.status === "Requested" ? "Acknowledge" : "In progress"}
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => change("Delivered")}
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
                    onClick={() => change("Verified")}
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
                  onClick={() => change("Cancelled")}
                >
                  Cancel dependency
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
