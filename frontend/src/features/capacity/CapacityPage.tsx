import {
  Users,
  ArrowUpRight,
  Check,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Avatar, Badge } from "../../components/ui";
import { State, View } from "../../lib";

type Props = {
  view: View;
  state: State;
  search: string;
  openProfile: (id: number) => void;
};
export function CapacityPage({ view, state, search, openProfile }: Props) {
  return (
    <>
      {view === "Team & capacity" && (
        <>
          <div className="capacity-explainer">
            <div>
              <span className="eyebrow">THE NEXT FIVE WORKDAYS</span>
              <h2>Good planning leaves a little room.</h2>
              <p>
                Capacity = working hours − reserved time − remaining committed
                effort.
              </p>
            </div>
            <span>
              <ShieldCheck size={17} />
              Employee confirmed · refreshed weekly
            </span>
          </div>
          <div className="team-grid">
            {state.employees
              .filter(
                (p) =>
                  !search ||
                  (p.name + " " + p.skills + " " + p.title)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  className="person-card"
                  key={p.id}
                  onClick={() => openProfile(p.id)}
                >
                  <div className="split">
                    <Avatar person={p} size={46} />
                    <ArrowUpRight size={17} />
                  </div>
                  <h3>{p.name}</h3>
                  <p>{p.title}</p>
                  <Badge value={p.capacity.state} />
                  <div className="capacity-bar">
                    <i
                      className="committed"
                      style={{
                        width:
                          Math.min(
                            100,
                            (p.capacity.committed / (p.weekly_hours || 1)) *
                              100,
                          ) + "%",
                      }}
                    />
                    <i
                      className="reserved"
                      style={{
                        width:
                          Math.min(
                            100,
                            (p.reserved_hours / (p.weekly_hours || 1)) * 100,
                          ) + "%",
                      }}
                    />
                  </div>
                  <div className="capacity-numbers">
                    <span>
                      <strong>{p.capacity.committed}h</strong>committed
                    </span>
                    <span>
                      <strong>
                        {p.capacity.available === null
                          ? "—"
                          : p.capacity.available + "h"}
                      </strong>
                      available
                    </span>
                    <span>
                      <strong>{p.reserved_hours}h</strong>reserved
                    </span>
                  </div>
                  <div className="skill-tags">
                    {p.skills
                      .split(",")
                      .slice(0, 3)
                      .map((s) => (
                        <span key={s}>{s.trim()}</span>
                      ))}
                  </div>
                  <small className="capacity-confirmation">
                    {p.capacity.confirmed ? (
                      <>
                        <Check size={12} />
                        Availability confirmed
                      </>
                    ) : (
                      <>
                        <AlertCircle size={12} />
                        Confirm availability before assigning
                      </>
                    )}
                  </small>
                </button>
              ))}
          </div>
          <div className="info-strip">
            <Users size={18} />
            <p>
              Blocked work still requires effort. A teammate with no recorded
              work has unknown capacity until they confirm availability.
            </p>
          </div>
        </>
      )}
    </>
  );
}
