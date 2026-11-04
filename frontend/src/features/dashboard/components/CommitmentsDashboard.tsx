import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  Link2,
  Users,
  ArrowUpRight,
  ArrowRight,
  ArrowDownToLine,
  Activity,
  X,
  SlidersHorizontal,
  Flag,
} from "lucide-react";
import { Avatar, Badge, Empty, healthTone } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { showToast } from "@/lib/ui-store";
import { DependencyCard } from "@/features/work/components/DependencyCard";
import { motion } from "motion/react";
import { revealOnScroll, rise, stagger } from "@/lib/motion";
import { WorkTable } from "@/features/work/components/WorkTable";
import {
  commitmentsCsv,
  commitmentsModel,
  downloadCsv,
} from "@/features/work/model";
import { stateQuery } from "@/features/workspace/api";
import { useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";

type CommitmentsView = "Overview" | "My work" | "All commitments";

export function CommitmentsDashboard({ view }: { view: CommitmentsView }) {
  const state = useWorkspace();
  const { dataUpdatedAt } = useQuery(stateQuery);
  const search = useWorkspaceSearch();
  const nav = useWorkspaceNavigation();
  const {
    summary,
    active,
    dashboardWork,
    risk,
    blocked,
    deps,
    available,
    filtered,
    displayWorks,
    coverage,
    scopePeople,
    overviewScope,
    statusFilter,
  } = commitmentsModel(state, view, search);
  const me = state.user;
  const openWork = (id: number) => nav.openWork(id);
  const setStatus = (status: string) =>
    nav.patchSearch({ status: status === "active" ? undefined : status });

  function exportCsv() {
    downloadCsv(
      "teampulse-" + state.today + ".csv",
      commitmentsCsv(state, filtered),
    );
    showToast("Current view exported as CSV.");
  }

  const projectCount = new Set(dashboardWork.map((w) => w.project_id)).size;
  const stats = [
    {
      label: "Active commitments",
      value: active.length,
      sub: `Across ${projectCount} project${projectCount === 1 ? "" : "s"}`,
      icon: CheckSquare,
      tone: summary.tone,
      filter: "active",
    },
    {
      label: "Need attention",
      value: risk.length,
      sub: `${active.filter((w) => w.health === "Overdue").length} past expected completion`,
      icon: Flag,
      tone: summary.counts.red ? "red" : risk.length ? "amber" : "green",
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
  ];

  // Motion is on for the Overview for now; other pages render exactly as before.
  const anim = view === "Overview";
  const riseProps = anim ? { variants: rise } : {};
  const scrollProps = anim ? revealOnScroll : {};

  return (
    <motion.div
      data-motion="manual"
      key={overviewScope}
      variants={stagger}
      initial={anim ? "hidden" : false}
      animate="show"
    >
      {view === "Overview" && (
        <>
          <motion.section
            {...riseProps}
            className={"pulse-banner tone-" + summary.tone}
          >
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
            <button onClick={() => nav.go("AI chat")}>
              Let's make a plan
              <ArrowUpRight size={16} />
            </button>
          </motion.section>
          <motion.section
            variants={anim ? stagger : undefined}
            className="stat-grid"
          >
            {stats.map(({ label, value, sub, icon: Icon, tone, filter }) => (
              <motion.button
                variants={rise}
                whileTap={{ scale: 0.985 }}
                className={"stat-card tone-" + tone}
                key={label}
                onClick={() =>
                  filter === "capacity"
                    ? nav.go("Team & capacity")
                    : nav.go("All commitments", {
                        status: filter === "active" ? undefined : filter,
                        drill: overviewScope,
                      })
                }
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
              </motion.button>
            ))}
          </motion.section>
        </>
      )}
      <div className={view === "Overview" ? "overview-grid" : ""}>
        <div className="overview-primary">
          {view === "My work" && (
            <div className="my-capacity">
              <div>
                <span className="eyebrow">Your next five workdays</span>
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
              <button className="button" onClick={() => nav.go("Settings")}>
                Review availability
                <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <motion.section {...riseProps} className="panel commitments-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {view === "Overview"
                    ? overviewScope === "team"
                      ? "Team tasks"
                      : overviewScope === "organization"
                        ? "Organization tasks"
                        : "Your tasks"
                    : view === "My work"
                      ? "My commitments"
                      : "All commitments"}
                  <span className="count">{filtered.length}</span>
                </h2>
                <p>
                  {view === "Overview"
                    ? overviewScope === "team"
                      ? "Tasks assigned to your reporting team."
                      : overviewScope === "organization"
                        ? "Every task in the organization."
                        : "Tasks assigned to you."
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
                    onClick={() => setStatus(t.v)}
                  >
                    {t.l}
                    {t.v === "attention" && <span>{risk.length}</span>}
                  </button>
                ))}
              </div>
              <div className="filter-selects">
                <select
                  aria-label="Filter team"
                  value={search.team ?? ""}
                  onChange={(e) =>
                    nav.patchSearch({
                      team: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
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
                  value={search.project ?? ""}
                  onChange={(e) =>
                    nav.patchSearch({
                      project: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
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
                  onClick={() => setStatus("active")}
                  aria-label="Clear status filter"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            <WorkTable
              works={displayWorks}
              state={state}
              onWork={(w) => openWork(w.id)}
              onPerson={(p) => nav.openProfile(p.id)}
            />
            {view === "Overview" && (
              <div className="panel-footer">
                <span>
                  <span className="live-dot" />
                  Updated{" "}
                  {new Date(dataUpdatedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <button onClick={() => nav.go("All commitments")}>
                  View all commitments
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </motion.section>
          {view === "Overview" && (
            <motion.section
              {...scrollProps}
              className="panel dependencies-preview"
            >
              <div className="panel-heading">
                <div>
                  <h2>Shared dependencies</h2>
                  <p>
                    Open dependencies between teammates that could use a nudge.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => nav.go("Dependencies")}
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
                    onWork={(w) => openWork(w.id)}
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
            </motion.section>
          )}
        </div>
        {view === "Overview" && (
          <aside className="overview-aside">
            <motion.section {...scrollProps} className="panel focus-panel">
              <div className="panel-heading">
                <div>
                  <h2>Today’s focus</h2>
                  <p>{dateLabel(state.today)}, from recorded work.</p>
                </div>
              </div>
              <ul className="focus-list">
                <li
                  className={
                    "focus-item " +
                    (risk.length
                      ? risk[0].health === "Overdue"
                        ? "tone-red"
                        : "tone-amber"
                      : "tone-green")
                  }
                >
                  <div className="focus-main">
                    <Badge
                      value={risk.length ? risk[0].health : "No delivery risks"}
                      tone={risk.length ? healthTone(risk[0].tone) : "green"}
                    />
                    <strong>
                      {risk.length ? risk[0].title : "Delivery is on track"}
                    </strong>
                    <p>
                      {risk.length
                        ? risk[0].health === "Overdue"
                          ? "Past its expected date. Confirm what changed before adjusting the plan."
                          : "Needs a progress check from its assignee."
                        : "No delivery exceptions are recorded. Keep confirmations up to date."}
                    </p>
                  </div>
                  {risk.length > 0 && (
                    <button
                      className="button small"
                      onClick={() => openWork(risk[0].id)}
                    >
                      Open
                    </button>
                  )}
                </li>
                <li
                  className={
                    "focus-item " + (deps.length ? "tone-amber" : "tone-green")
                  }
                >
                  <div className="focus-main">
                    <Badge
                      value={deps.length ? "Waiting" : "Nothing blocked"}
                      tone={deps.length ? "amber" : "green"}
                    />
                    <strong>
                      {deps.length
                        ? deps[0].deliverable
                        : "No open dependencies"}
                    </strong>
                    <p>
                      {deps.length
                        ? `${
                            state.directory
                              .find((p) => p.id === deps[0].owner_id)
                              ?.name.split(" ")[0] ?? "Someone"
                          } is delivering it. Shared work is waiting.`
                        : "Nothing is waiting on anyone."}
                    </p>
                  </div>
                  {deps.length > 0 && (
                    <button
                      className="button small"
                      onClick={() => openWork(deps[0].work_item_id)}
                    >
                      Open
                    </button>
                  )}
                </li>
                <li
                  className={
                    "focus-item " +
                    (available.length ? "tone-green" : "tone-neutral")
                  }
                >
                  <div className="focus-main">
                    <Badge
                      value={
                        available.length ? "Room to help" : "Capacity unknown"
                      }
                      tone={available.length ? "green" : "neutral"}
                    />
                    <strong>
                      {available.length
                        ? `${available[0].name} has ${available[0].capacity.available}h free`
                        : "Confirm availability"}
                    </strong>
                    <p>
                      {available.length
                        ? "Confirmed room in the next five workdays. Check skills before assigning."
                        : "Ask teammates to confirm their availability before assigning more work."}
                    </p>
                  </div>
                  <button
                    className="button small"
                    onClick={() => nav.go("Team & capacity")}
                  >
                    Team
                  </button>
                </li>
              </ul>
              <div className="panel-footer focus-footer">
                <button
                  className="text-button"
                  onClick={() => nav.go("AI chat")}
                >
                  Ask the assistant to plan
                </button>
              </div>
            </motion.section>
            <motion.section {...scrollProps} className="panel team-snapshot">
              <div className="panel-heading">
                <h2>Team at a glance</h2>
                <button
                  className="icon-button"
                  aria-label="View team capacity"
                  onClick={() => nav.go("Team & capacity")}
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
                    onClick={() => nav.openProfile(p.id)}
                  >
                    <Avatar person={p} size={32} />
                  </button>
                ))}
              </div>
              <div className="snapshot-footer">
                <span className="tiny-dot" />
                Work visibility. Human context.
              </div>
            </motion.section>
          </aside>
        )}
      </div>
    </motion.div>
  );
}
