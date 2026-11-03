import { ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/ui";
import { ago } from "@/lib/format";
import { useNow, useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";

export function ActivityPage() {
  const state = useWorkspace();
  const now = useNow();
  const { q: search = "" } = useWorkspaceSearch();
  const nav = useWorkspaceNavigation();
  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <div>
          <h2>The story behind the work</h2>
          <p>Updates, commitments, and decisions in one shared timeline.</p>
        </div>
        <span className="eyebrow">LATEST 100 EVENTS</span>
      </div>
      <div className="activity-list">
        {state.activity
          .filter(
            (a) =>
              !search || a.message.toLowerCase().includes(search.toLowerCase()),
          )
          .map((a) => (
            <div className="activity-event" key={a.id}>
              <Avatar
                person={state.employees.find((p) => p.id === a.actor_id)}
                size={35}
              />
              <div>
                <strong>
                  {state.directory.find((p) => p.id === a.actor_id)?.name ||
                    "Team member"}
                </strong>
                <p>{a.message}</p>
                {a.work_item_id && (
                  <button
                    className="text-button"
                    onClick={() => nav.openWork(a.work_item_id!)}
                  >
                    View commitment
                    <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
              <small>{ago(a.created_at, now)}</small>
            </div>
          ))}
      </div>
    </section>
  );
}
