import { Link2, ShieldCheck } from "lucide-react";
import { Empty } from "../../components/ui";
import { DependencyCard } from "../work/DependencyCard";
import { State, View, openDependency } from "../../lib";

type Props = {
  view: View;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  state: State;
  search: string;
  setSelectedId: (id: number | null) => void;
  refresh: (message?: string) => Promise<void>;
};
export function DependenciesPage({
  view,
  statusFilter,
  setStatusFilter,
  state,
  search,
  setSelectedId,
  refresh,
}: Props) {
  return (
    <>
      {view === "Dependencies" && (
        <>
          <div className="section-toolbar">
            <div className="segmented">
              {[
                ["active", "Open dependencies"],
                ["all", "All dependencies"],
                ["Delivered", "Ready to verify"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={statusFilter === v ? "active" : ""}
                  onClick={() => setStatusFilter(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="muted">
              <Link2 size={14} />
              Delivery is a step. Verification closes the loop.
            </span>
          </div>
          <div className="dependency-grid">
            {state.dependencies
              .filter(
                (d) =>
                  (statusFilter === "all" ||
                    (statusFilter === "active" && openDependency(d)) ||
                    d.status === statusFilter) &&
                  (!search ||
                    (d.deliverable + " " + d.reason)
                      .toLowerCase()
                      .includes(search.toLowerCase())),
              )
              .map((d) => (
                <DependencyCard
                  key={d.id}
                  dep={d}
                  state={state}
                  onWork={(w) => setSelectedId(w.id)}
                  onRefresh={refresh}
                />
              ))}
          </div>
          {!state.dependencies.filter(
            (d) =>
              statusFilter === "all" ||
              (statusFilter === "active" && openDependency(d)) ||
              d.status === statusFilter,
          ).length && (
            <Empty
              title="Nothing waiting here"
              description="Open a work item to record a dependency and identify its owner."
            />
          )}
          <div className="info-strip">
            <ShieldCheck size={17} />
            <p>
              Owners report delivery. Requesters verify that it works. Shared
              work remains blocked until every required deliverable is verified
              or cancelled.
            </p>
          </div>
        </>
      )}
    </>
  );
}
