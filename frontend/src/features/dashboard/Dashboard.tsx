import {
  CheckSquare,
  Link2,
  Users,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  ArrowDownToLine,
  Activity,
  X,
  ShieldCheck,
  SlidersHorizontal,
  Flag,
} from "lucide-react";
import { Avatar, Empty } from "../../components/ui";
import { WorkTable } from "../work/WorkTable";
import { DependencyCard } from "../work/DependencyCard";
import {
  State,
  Person,
  Work,
  View,
  Dependency,
  HealthSummary,
  dateLabel,
} from "../../lib";

type Props = {
  view: View;
  summary: HealthSummary;
  navigate: (view: View, filter?: string) => void;
  active: Work[];
  dashboardWork: Work[];
  risk: Work[];
  blocked: Work[];
  deps: Dependency[];
  available: Person[];
  setDrillScope: (value: string) => void;
  overviewScope: string;
  me: Person;
  filtered: Work[];
  exportCsv: () => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  teamFilter: string;
  setTeamFilter: (value: string) => void;
  state: State;
  projectFilter: string;
  setProjectFilter: (value: string) => void;
  displayWorks: Work[];
  setSelectedId: (id: number | null) => void;
  openProfile: (id: number) => void;
  lastSync: Date;
  refresh: (message?: string) => Promise<void>;
  coverage: number;
  scopePeople: Person[];
};
export function Dashboard({
  view,
  summary,
  navigate,
  active,
  dashboardWork,
  risk,
  blocked,
  deps,
  available,
  setDrillScope,
  overviewScope,
  me,
  filtered,
  exportCsv,
  statusFilter,
  setStatusFilter,
  teamFilter,
  setTeamFilter,
  state,
  projectFilter,
  setProjectFilter,
  displayWorks,
  setSelectedId,
  openProfile,
  lastSync,
  refresh,
  coverage,
  scopePeople,
}: Props) {
  return (
    <>
      {view === "Overview" && (
        <>
          <section className={"pulse-banner tone-" + summary.tone}>
            <div className="pulse-banner-symbol">
              <Activity size={23} />
              <i />
            </div>
            <div>
              <strong>
                {summary.tone === "green"
                  ? "Everything is on track."
                  : summary.tone === "red"
                    ? "A little attention can move work forward."
                    : summary.tone === "amber"
                      ? "A few things are ready for review."
                      : "Let’s confirm the picture."}
              </strong>
              <p>
                {summary.counts.red} need action · {summary.counts.amber} need
                review · {summary.counts.green} on track ·{" "}
                {summary.counts.neutral} unconfirmed.{" "}
                {summary.tone === "green"
                  ? "No intervention needed. Respect the current plan."
                  : "Open a commitment to see the reason and the next step."}
              </p>
            </div>
            <button onClick={() => navigate("AI chat")}>
              Let's make a plan
              <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="stat-grid">
            {[
              {
                label: "Active commitments",
                value: active.length,
                sub: `Across ${new Set(dashboardWork.map((w) => w.project_id)).size} project${new Set(dashboardWork.map((w) => w.project_id)).size === 1 ? "" : "s"}`,
                icon: CheckSquare,
                tone: summary.tone,
                filter: "active",
              },
              {
                label: "Need attention",
                value: risk.length,
                sub: `${active.filter((w) => w.health === "Overdue").length} past expected completion`,
                icon: Flag,
                tone: summary.counts.red
                  ? "red"
                  : risk.length
                    ? "amber"
                    : "green",
                filter: "attention",
              },
              {
                label: "Blocked or waiting",
                value: blocked.length,
                sub: `${deps.length} open dependencies`,
                icon: Link2,
                tone: blocked.some((w) => w.tone === "red")
                  ? "red"
                  : blocked.length
                    ? "amber"
                    : "green",
                filter: "blocked",
              },
              {
                label: "Room to contribute",
                value: available.length,
                sub: "Teammates with confirmed capacity",
                icon: Users,
                tone: "green",
                filter: "capacity",
              },
            ].map(({ label, value, sub, icon: Icon, tone, filter }) => (
              <button
                className={"stat-card tone-" + tone}
                key={label}
                onClick={() => {
                  navigate(
                    filter === "capacity"
                      ? "Team & capacity"
                      : "All commitments",
                    filter === "capacity" ? "active" : filter,
                  );
                  setDrillScope(overviewScope);
                }}
              >
                <div className="split">
                  <span>{label}</span>
                  <span className="stat-icon">
                    <Icon size={17} />
                  </span>
                </div>
                <strong>
                  {String(value).padStart(2, "0")}
                  <ArrowUpRight size={19} />
                </strong>
                <small>{sub}</small>
              </button>
            ))}
          </section>
        </>
      )}
      {["Overview", "My work", "All commitments"].includes(view) && (
        <div className={view === "Overview" ? "overview-grid" : ""}>
          <div className="overview-primary">
            {view === "My work" && (
              <div className="my-capacity">
                <div>
                  <span className="eyebrow">YOUR NEXT FIVE WORKDAYS</span>
                  <h3>
                    {me.capacity.confirmed
                      ? `${me.capacity.available}h of confirmed room`
                      : "How is your capacity looking?"}
                  </h3>
                  <p>
                    {me.capacity.committed}h committed · {me.reserved_hours}h
                    reserved for meetings and operations
                  </p>
                </div>
                <button className="button" onClick={() => navigate("Settings")}>
                  Review availability
                  <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            <section className="panel commitments-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {view === "Overview"
                      ? "Work in motion"
                      : view === "My work"
                        ? "My commitments"
                        : "All commitments"}
                    <span className="count">{filtered.length}</span>
                  </h2>
                  <p>
                    {view === "Overview"
                      ? "The latest picture of your team’s commitments."
                      : "Delivery dates are commitments. Effort is an estimate."}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Export current commitments"
                  onClick={exportCsv}
                >
                  <ArrowDownToLine size={17} />
                </button>
              </div>
              <div className="table-filters">
                <div className="segmented">
                  {[
                    { v: "active", l: "Active" },
                    { v: "attention", l: "Needs attention" },
                    { v: "all", l: "All work" },
                  ].map((t) => (
                    <button
                      className={statusFilter === t.v ? "active" : ""}
                      key={t.v}
                      onClick={() => setStatusFilter(t.v)}
                    >
                      {t.l}
                      {t.v === "attention" && <span>{risk.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="filter-selects">
                  <select
                    aria-label="Filter team"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                  >
                    <option value="">All teams</option>
                    {state.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter project"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  >
                    <option value="">All projects</option>
                    {state.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {["blocked", "Completed"].includes(statusFilter) && (
                <div className="active-filter">
                  <SlidersHorizontal size={13} />
                  Showing {statusFilter.toLowerCase()} work
                  <button
                    onClick={() => setStatusFilter("active")}
                    aria-label="Clear status filter"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <WorkTable
                works={displayWorks}
                state={state}
                onWork={(w) => setSelectedId(w.id)}
                onPerson={(p) => openProfile(p.id)}
              />
              {view === "Overview" && (
                <div className="panel-footer">
                  <span>
                    <span className="live-dot" />
                    Updated{" "}
                    {lastSync.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <button onClick={() => navigate("All commitments")}>
                    View all commitments
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
            {view === "Overview" && (
              <section className="panel dependencies-preview">
                <div className="panel-heading">
                  <div>
                    <h2>A little coordination goes a long way</h2>
                    <p>Shared dependencies that could use a nudge.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("Dependencies")}
                  >
                    View all
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="dependency-preview-grid">
                  {deps.slice(0, 2).map((d) => (
                    <DependencyCard
                      key={d.id}
                      dep={d}
                      state={state}
                      onWork={(w) => setSelectedId(w.id)}
                      onRefresh={refresh}
                      compact
                    />
                  ))}
                  {!deps.length && (
                    <Empty
                      title="The way is clear"
                      description="There are no open dependencies."
                    />
                  )}
                </div>
              </section>
            )}
          </div>
          {view === "Overview" && (
            <aside className="overview-aside">
              <section className="briefing-card">
                <div className="split">
                  <span className="eyebrow">
                    <Sparkles size={14} />
                    THE DAILY BRIEF
                  </span>
                  <span className="briefing-date">
                    {dateLabel(state.today)}
                  </span>
                </div>
                <h2>
                  Big picture.
                  <br />
                  Clear next steps.
                </h2>
                <p className="briefing-intro">
                  A snapshot from your team's recorded work.
                </p>
                <div className="brief-item">
                  <span className="brief-number">01</span>
                  <div>
                    <h4>
                      {risk.length
                        ? "Keep an eye on delivery."
                        : "Keep the momentum."}
                    </h4>
                    <p>
                      {risk.length ? (
                        <>
                          <button onClick={() => setSelectedId(risk[0].id)}>
                            {risk[0].title}
                          </button>{" "}
                          {risk[0].health === "Overdue"
                            ? "is past its expected date. Confirm what changed before adjusting the plan."
                            : "needs a progress check. Check its latest context."}
                        </>
                      ) : (
                        "No current delivery exceptions are recorded. Keep confirmations up to date."
                      )}
                    </p>
                  </div>
                </div>
                <div className="brief-item">
                  <span className="brief-number">02</span>
                  <div>
                    <h4>
                      {deps.length
                        ? "Unblock the next step."
                        : "Room to move forward."}
                    </h4>
                    <p>
                      {deps.length ? (
                        <>
                          {deps[0].deliverable} is needed for shared work.{" "}
                          {
                            state.employees
                              .find((p) => p.id === deps[0].owner_id)
                              ?.name.split(" ")[0]
                          }{" "}
                          owns the next step.
                        </>
                      ) : (
                        "No unresolved dependencies are recorded."
                      )}
                    </p>
                  </div>
                </div>
                <div className="brief-item">
                  <span className="brief-number">03</span>
                  <div>
                    <h4>A little room to help.</h4>
                    <p>
                      {available.length ? (
                        <>
                          {available[0].name.split(" ")[0]} has{" "}
                          {available[0].capacity.available}h of confirmed room
                          in the next five workdays. Review skills before
                          proposing work.
                        </>
                      ) : (
                        "Confirm availability with your teammates before assigning more work."
                      )}
                    </p>
                  </div>
                </div>
                <button
                  className="briefing-button"
                  onClick={() => navigate("AI chat")}
                >
                  Talk through the plan
                  <ArrowUpRight size={16} />
                </button>
                <small className="briefing-disclosure">
                  <ShieldCheck size={12} />
                  Based on recorded facts. No performance judgments.
                </small>
              </section>
              <section className="panel team-snapshot">
                <div className="panel-heading">
                  <h2>Team at a glance</h2>
                  <button
                    className="icon-button"
                    aria-label="View team capacity"
                    onClick={() => navigate("Team & capacity")}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="plan-coverage">
                  <div>
                    <strong>
                      {coverage}
                      <span>/{scopePeople.length}</span>
                    </strong>
                    <span>
                      teammates with
                      <br />
                      confirmed plans
                    </span>
                  </div>
                  <div className="coverage-track">
                    <i
                      style={{
                        width: (coverage / state.employees.length) * 100 + "%",
                      }}
                    />
                  </div>
                </div>
                <div className="avatar-stack">
                  {scopePeople.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      aria-label={"View " + p.name}
                      onClick={() => openProfile(p.id)}
                    >
                      <Avatar person={p} size={32} />
                    </button>
                  ))}
                </div>
                <div className="snapshot-footer">
                  <span className="tiny-dot" />
                  Work visibility. Human context.
                </div>
              </section>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
