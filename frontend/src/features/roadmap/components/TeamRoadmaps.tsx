import { ChevronRight } from "lucide-react";
import { Avatar, Empty } from "@/components/ui";
import type { RoadmapSummary } from "../api";
import { RoadmapBar, band } from "./RoadmapView";

/** Everyone below you in the reporting line, with how much of their roadmap they have achieved. */
export function TeamRoadmaps({
  rows,
  onOpen,
}: {
  rows: RoadmapSummary[];
  onOpen: (personId: number) => void;
}) {
  if (!rows.length)
    return (
      <section className="panel">
        <Empty
          title="No one reports to you"
          description="Roadmaps of people in your team appear here."
        />
      </section>
    );
  const average = Math.round(
    rows.reduce((sum, r) => sum + r.percent, 0) / rows.length,
  );
  return (
    <section className="panel rm-team">
      <div className="panel-heading">
        <div>
          <h2>Team roadmaps</h2>
          <p>
            {rows.length} {rows.length === 1 ? "person" : "people"} in your
            reporting line. Average {average}% achieved.
          </p>
        </div>
      </div>
      <ul className="rm-team-list">
        {rows.map((r) => (
          <li key={r.person.id}>
            <button
              className={"rm-team-row " + band(r.percent)}
              onClick={() => onOpen(r.person.id)}
            >
              <Avatar person={r.person} size={34} />
              <span className="rm-team-name">
                <strong>{r.person.name}</strong>
                <small>
                  {r.person.title} ·{" "}
                  {r.direct ? "Direct report" : "In your team"}
                </small>
              </span>
              <span className="rm-team-track">{r.track}</span>
              <span className="rm-team-progress">
                <RoadmapBar
                  percent={r.percent}
                  label={`${r.person.name}: ${r.percent}% achieved`}
                />
                <strong>{r.percent}%</strong>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
