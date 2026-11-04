import { useState, type DragEvent } from "react";
import { CalendarClock, Flag, GripVertical } from "lucide-react";
import { Badge, FormError, healthTone } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { errorMessage } from "@/lib/forms";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { DirectoryPerson, Work } from "@/features/workspace/types";
import { moveWork, type ProjectDetail } from "../api";
import { OwnerActions } from "./ProjectCommitments";
import type { ProjectActions } from "./ProjectPage";

/** Kanban lanes, in the order work moves through them. */
export const LANES = [
  "Planned",
  "In Progress",
  "Partially Blocked",
  "Blocked",
  "Awaiting Verification",
  "Completed",
] as const;

const LANE_TONE: Record<string, string> = {
  "Partially Blocked": "warn",
  Blocked: "late",
  "Awaiting Verification": "warn",
  Completed: "done",
};

/**
 * Drag a card to another lane to change its status. Only cards the viewer can
 * edit are draggable, and the server still applies every rule: completion is the
 * owner's call, and open dependencies must be resolved first. Each card also has a
 * "Move to" menu, so the board works without a mouse.
 */
export function ProjectBoard({
  data,
  works,
  actions,
  directory,
  userId,
}: {
  data: ProjectDetail;
  works: Work[];
  actions: ProjectActions;
  directory: DirectoryPerson[];
  userId: number;
}) {
  const move = useWorkspaceMutation(
    moveWork,
    (_r, v) => `Moved to ${v.status}.`,
  );
  const [dragging, setDragging] = useState<Work | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (status: string) => {
    const work = dragging;
    setDragging(null);
    setOver(null);
    if (work && work.status !== status) move.mutate({ id: work.id, status });
  };
  const allowDrop = (status: string) => (e: DragEvent) => {
    if (!dragging || dragging.status === status) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== status) setOver(status);
  };

  return (
    <section className="pj-board-wrap">
      <FormError message={move.error ? errorMessage(move.error) : ""} />
      <div className="pj-board" aria-label="Commitments board">
        {LANES.map((lane) => {
          const cards = works.filter((w) => w.status === lane);
          return (
            <div
              key={lane}
              className={
                "pj-lane" +
                (LANE_TONE[lane] ? " tone-" + LANE_TONE[lane] : "") +
                (over === lane ? " is-over" : "")
              }
              onDragOver={allowDrop(lane)}
              onDragLeave={() => over === lane && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                drop(lane);
              }}
            >
              <h3>
                {lane}
                <small>{cards.length}</small>
              </h3>
              <ul>
                {cards.map((w) => {
                  const movable = w.can_edit && !move.isPending;
                  return (
                    <li
                      key={w.id}
                      className={
                        "pj-card tone-" +
                        w.tone +
                        (dragging?.id === w.id ? " is-dragging" : "")
                      }
                      draggable={movable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(w.id));
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(w);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    >
                      <div className="pj-card-top">
                        {movable && (
                          <GripVertical
                            size={14}
                            className="pj-grip"
                            aria-hidden="true"
                          />
                        )}
                        <button
                          className="pj-card-title"
                          onClick={() => actions.openWork(w.id)}
                        >
                          {w.title}
                        </button>
                      </div>
                      <div className="pj-card-meta">
                        <Badge value={w.health} tone={healthTone(w.tone)} />
                        {(w.priority === "Urgent" || w.priority === "High") && (
                          <span className="pj-flag">
                            <Flag size={11} />
                            {w.priority}
                          </span>
                        )}
                      </div>
                      <div className="pj-card-progress">
                        <span className="progress-track" aria-hidden="true">
                          <i
                            style={{
                              width: w.progress + "%",
                              background: `var(--progress-${w.tone})`,
                            }}
                          />
                        </span>
                        <span>{w.progress}%</span>
                        <span className="pj-card-date">
                          <CalendarClock size={12} />
                          {dateLabel(w.due_date, data.today)}
                        </span>
                      </div>
                      <OwnerActions
                        work={w}
                        data={data}
                        directory={directory}
                        actions={actions}
                        compact
                      />
                      {w.can_edit && (
                        <label className="pj-move">
                          <span>Move to</span>
                          <select
                            value={w.status}
                            disabled={move.isPending}
                            onChange={(e) =>
                              move.mutate({ id: w.id, status: e.target.value })
                            }
                          >
                            {LANES.filter(
                              (l) =>
                                l !== "Completed" ||
                                w.owner_id === userId ||
                                w.status === "Completed",
                            ).map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
                {!cards.length && (
                  <li className="pj-lane-empty">Nothing here</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
