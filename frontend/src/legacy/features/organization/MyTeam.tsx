import { useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Avatar, Empty } from "../../components/ui";
import { HealthSignal } from "./HealthSignal";
import { State, summarizeHealth } from "../../lib";

export function MyTeam({
  state,
  onProfile,
}: {
  state: State;
  onProfile: (id: number) => void;
}) {
  const [direct, setDirect] = useState(false);
  const ids = state.report_ids,
    people = state.employees.filter(
      (p) =>
        p.active &&
        ids.includes(p.id) &&
        (!direct || p.manager_id === state.user.id),
    );
  const work = state.work.filter((w) =>
    people.some((p) => p.id === w.owner_id),
  );
  const health = summarizeHealth(work);
  return (
    <>
      <div className="team-page-summary">
        <HealthSignal health={health} />
        <div className="team-summary-number">
          <strong>{people.length}</strong>
          <span>{direct ? "direct reports" : "direct & indirect reports"}</span>
        </div>
      </div>
      <div className="section-toolbar">
        <div className="segmented">
          <button
            className={!direct ? "active" : ""}
            onClick={() => setDirect(false)}
          >
            All reports
          </button>
          <button
            className={direct ? "active" : ""}
            onClick={() => setDirect(true)}
          >
            Direct reports
          </button>
        </div>
        <span className="muted">
          <ShieldCheck size={14} />
          Your own work remains in My workspace.
        </span>
      </div>
      <div className="report-card-grid">
        {people.map((p) => {
          const works = state.work.filter((w) => w.owner_id === p.id),
            health = summarizeHealth(works);
          return (
            <button
              className={"report-card tone-" + health.tone}
              key={p.id}
              onClick={() => onProfile(p.id)}
            >
              <div className="split">
                <Avatar person={p} size={43} />
                <span className={"health-label " + health.tone}>
                  {health.label}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.title}</p>
              <div className="report-card-work">
                <strong>
                  {works.filter((w) => w.status !== "Completed").length}
                </strong>{" "}
                active commitments <span>·</span>{" "}
                {p.capacity.available === null
                  ? "Capacity unconfirmed"
                  : p.capacity.available + "h available"}
              </div>
              <div className="report-card-footer">
                <span>
                  {state.directory.find((d) => d.id === p.id)?.manager_id ===
                  state.user.id
                    ? "Direct report"
                    : "Reports to " +
                      state.directory
                        .find((d) => d.id === p.manager_id)
                        ?.name.split(" ")[0]}
                </span>
                <span>
                  Open profile
                  <ArrowUpRight size={14} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {!people.length && (
        <Empty
          title="No reports in this view"
          description="Reporting relationships can be managed in Organization by your workspace administrator."
        />
      )}
    </>
  );
}
