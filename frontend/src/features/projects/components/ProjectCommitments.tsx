import { useState } from "react";
import {
  ArrowRightLeft,
  ChevronRight,
  Flag,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Avatar, Badge, Empty, healthTone } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import type { DirectoryPerson, Work } from "@/features/workspace/types";
import type { ProjectDetail } from "../api";
import type { ProjectActions } from "./ProjectPage";

const FILTERS = {
  Open: (w: Work) => w.status !== "Completed",
  "Need attention": (w: Work) =>
    w.status !== "Completed" && (w.tone === "red" || w.tone === "amber"),
  Unassigned: (w: Work) => w.status !== "Completed" && !w.owner_id,
  Completed: (w: Work) => w.status === "Completed",
  All: () => true,
} as const;
type Filter = keyof typeof FILTERS;

/** The owner cell: who has it, and the assign / take actions this viewer may use. */
export function OwnerActions({
  work,
  data,
  directory,
  actions,
  compact = false,
}: {
  work: Work;
  data: ProjectDetail;
  directory: DirectoryPerson[];
  actions: ProjectActions;
  compact?: boolean;
}) {
  const owner = directory.find((p) => p.id === work.owner_id);
  const open = work.status !== "Completed";
  const { can_assign, can_take } = data.permissions;
  return (
    <div className="pj-owner">
      {owner ? (
        <span className="pj-owner-name">
          <Avatar person={owner} size={compact ? 20 : 24} />
          {compact ? owner.name.split(" ")[0] : owner.name}
        </span>
      ) : (
        <span className="pj-owner-name muted">Unassigned</span>
      )}
      {open && (
        <span className="pj-owner-actions">
          {!owner && can_take && (
            <button
              className="button small"
              onClick={() => actions.take(work)}
              aria-label={"Take " + work.title}
            >
              <UserCheck size={13} />
              Take it
            </button>
          )}
          {can_assign && (
            <button
              className="button small"
              onClick={() => actions.assign(work)}
              aria-label={(owner ? "Reassign " : "Assign ") + work.title}
            >
              {owner ? <ArrowRightLeft size={13} /> : <UserPlus size={13} />}
              {owner ? "Reassign" : "Assign"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export function ProjectCommitments({
  data,
  works,
  actions,
  directory,
}: {
  data: ProjectDetail;
  works: Work[];
  actions: ProjectActions;
  directory: DirectoryPerson[];
}) {
  const [filter, setFilter] = useState<Filter>("Open");
  const shown = works.filter(FILTERS[filter]);
  return (
    <section className="panel pj-section pj-table">
      <div className="pj-section-head">
        <h2>Commitments</h2>
        <div
          className="pj-filters"
          role="group"
          aria-label="Filter commitments"
        >
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
              <small>{works.filter(FILTERS[f]).length}</small>
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Project commitments"
          tabIndex={0}
        >
          <table className="work-table pj-work-table">
            <thead>
              <tr>
                <th>Commitment</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Expected</th>
                <th>Progress</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.id} className={"work-row tone-" + w.tone}>
                  <td>
                    <button
                      className="work-title"
                      onClick={() => actions.openWork(w.id)}
                    >
                      {w.title}
                    </button>
                    {(w.priority === "Urgent" || w.priority === "High") && (
                      <div className="subline">
                        <Flag size={11} className="red-text" />
                        {w.priority} priority
                      </div>
                    )}
                  </td>
                  <td>
                    <OwnerActions
                      work={w}
                      data={data}
                      directory={directory}
                      actions={actions}
                    />
                  </td>
                  <td>
                    <Badge value={w.status} />
                    <span className="health-badge" title={w.health_reason}>
                      <Badge value={w.health} tone={healthTone(w.tone)} />
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        w.health === "Overdue" ? "red-text" : "date-cell"
                      }
                    >
                      {dateLabel(w.due_date, data.today)}
                    </span>
                    <small className="muted">{w.remaining_hours}h left</small>
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-track">
                        <i
                          style={{
                            width: w.progress + "%",
                            background: `var(--progress-${w.tone})`,
                          }}
                        />
                      </div>
                      <span>{w.progress}%</span>
                    </div>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"Open " + w.title}
                      onClick={() => actions.openWork(w.id)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            filter === "Need attention"
              ? "Nothing needs attention"
              : "No commitments here"
          }
          description="Try another filter, or add a commitment to this project."
        />
      )}
    </section>
  );
}
