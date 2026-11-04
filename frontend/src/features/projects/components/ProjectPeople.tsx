import { ArrowUpRight } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import type { Team } from "@/features/workspace/types";
import type { ProjectDetail } from "../api";

const INVOLVEMENT = {
  Department: "Owning department",
  Invited: "Invited to the project",
  Contributor: "Owns work here",
} as const;

/** Everyone involved, each in a container tinted when their work here needs action. */
export function ProjectPeople({
  data,
  teams,
  onProfile,
  onWork,
}: {
  data: ProjectDetail;
  teams: Team[];
  onProfile: (id: number) => void;
  onWork: (id: number) => void;
}) {
  const team = (id: number) => teams.find((t) => t.id === id)?.name;
  return (
    <div className="pj-people">
      {data.members.map((m) => {
        const open = data.work.filter(
          (w) => w.owner_id === m.id && w.status !== "Completed",
        );
        return (
          <section
            key={m.id}
            className={"panel pj-person" + (m.needs_action ? " tone-late" : "")}
          >
            <div className="pj-person-head">
              <Avatar person={m} size={38} />
              <div>
                {m.can_view_profile ? (
                  <button
                    className="pj-person-name"
                    onClick={() => onProfile(m.id)}
                  >
                    {m.name}
                    <ArrowUpRight size={13} />
                  </button>
                ) : (
                  <strong className="pj-person-name">{m.name}</strong>
                )}
                <small>
                  {m.title}
                  {team(m.team_id) ? `, ${team(m.team_id)}` : ""}
                </small>
              </div>
            </div>
            <div className="pj-person-badges">
              {m.is_lead && <Badge value="Lead" tone="purple" plain />}
              <Badge value={INVOLVEMENT[m.involvement]} tone="neutral" plain />
              {m.needs_action > 0 && (
                <Badge value={`${m.needs_action} need action`} tone="red" />
              )}
            </div>
            <dl className="pj-person-stats">
              <div>
                <dt>Open</dt>
                <dd>{m.open_count}</dd>
              </div>
              <div>
                <dt>Done</dt>
                <dd>{m.completed_count}</dd>
              </div>
              <div>
                <dt>Hours left</dt>
                <dd>{m.remaining_hours}</dd>
              </div>
            </dl>
            {open.length > 0 && (
              <ul className="pj-person-work">
                {open.slice(0, 3).map((w) => (
                  <li key={w.id}>
                    <button onClick={() => onWork(w.id)}>{w.title}</button>
                  </li>
                ))}
                {open.length > 3 && (
                  <li className="muted">and {open.length - 3} more</li>
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
