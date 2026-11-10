import { ChevronRight, Flag } from "lucide-react";
import { motion } from "motion/react";
import { Avatar, Badge, Empty, healthTone } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import type { Work, WorkspaceState } from "@/features/workspace/types";

const PROGRESS_COLORS = {
  green: "var(--color-done-ink)",
  amber: "var(--color-warn-ink)",
  red: "var(--color-late-ink)",
  neutral: "var(--color-rule-2)",
};

export function WorkTable({
  works,
  state,
  onWork,
  onPerson,
}: {
  works: Work[];
  state: WorkspaceState;
  onWork: (w: Work) => void;
  onPerson: (p: { id: number }) => void;
}) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Commitments table"
      tabIndex={0}
    >
      {works.length ? (
        <table className="work-table">
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
            {works.map((w) => {
              const p = state.directory.find((p) => p.id === w.owner_id),
                project = state.projects.find((p) => p.id === w.project_id);
              return (
                <tr key={w.id} className={"work-row tone-" + w.tone}>
                  <td>
                    <button className="work-title" onClick={() => onWork(w)}>
                      {w.title}
                    </button>
                    <div className="subline">
                      <span
                        className="project-dot"
                        style={{ background: project?.color }}
                      />
                      {project?.name}
                      {w.priority === "Urgent" && (
                        <Flag size={11} className="red-text" />
                      )}
                    </div>
                  </td>
                  <td>
                    {p ? (
                      <button
                        className="person-inline"
                        disabled={!p.can_view_profile}
                        title={
                          p.can_view_profile
                            ? "Open work profile"
                            : "Shared project colleague; full profile is outside your reporting scope"
                        }
                        onClick={() => onPerson(p)}
                      >
                        <Avatar person={p} size={27} />
                        <span>{p.name.split(" ")[0]}</span>
                      </button>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
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
                      {dateLabel(w.due_date, state.today)}
                    </span>
                    <small className="muted">{w.remaining_hours}h left</small>
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-track">
                        <motion.i
                          style={{
                            width: "100%",
                            originX: 0,
                            background: PROGRESS_COLORS[w.tone],
                          }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: w.progress / 100 }}
                          transition={{
                            duration: 0.7,
                            ease: [0.22, 1, 0.36, 1],
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
                      onClick={() => onWork(w)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Empty
          title="A little breathing room"
          description="No commitments match this view. Try a different filter or create a new commitment."
        />
      )}
    </div>
  );
}
