import { Link2, ShieldCheck } from "lucide-react";
import { Empty } from "@/components/ui";
import { DependencyCard } from "@/features/work/components/DependencyCard";
import { openDependency } from "@/features/workspace/domain";
import { useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";
import type { Dependency } from "@/features/workspace/types";

export function DependenciesPage() {
  const state = useWorkspace();
  const { status: statusFilter = "active", q: search = "" } =
    useWorkspaceSearch();
  const nav = useWorkspaceNavigation();
  const matchesStatus = (d: Dependency) =>
    statusFilter === "all" ||
    (statusFilter === "active" && openDependency(d)) ||
    d.status === statusFilter;
  return (
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
              onClick={() =>
                nav.patchSearch({ status: v === "active" ? undefined : v })
              }
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
              matchesStatus(d) &&
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
              onWork={(w) => nav.openWork(w.id)}
            />
          ))}
      </div>
      {!state.dependencies.filter(matchesStatus).length && (
        <Empty
          title="Nothing waiting here"
          description="Open a work item to record a dependency and identify its owner."
        />
      )}
      <div className="info-strip">
        <ShieldCheck size={17} />
        <p>
          Owners report delivery. Requesters verify that it works. Shared work
          remains blocked until every required deliverable is verified or
          cancelled.
        </p>
      </div>
    </>
  );
}
