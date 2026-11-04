import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Columns3,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader2,
  Users,
} from "lucide-react";
import { Avatar, Badge, Empty, healthTone } from "@/components/ui";
import { ago, dateLabel } from "@/lib/format";
import { useNow, useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";
import type { Work } from "@/features/workspace/types";
import { projectQuery, type ProjectDetail } from "../api";
import { AssignDialog } from "./AssignDialog";
import { ProjectActivity } from "./ProjectActivity";
import { ProjectBoard } from "./ProjectBoard";
import { ProjectCommitments } from "./ProjectCommitments";
import { ProjectPeople } from "./ProjectPeople";

export const PROJECT_TABS = [
  "Overview",
  "Commitments",
  "Board",
  "People",
  "Activity",
] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

const TAB_ICONS = {
  Overview: LayoutDashboard,
  Commitments: ListChecks,
  Board: Columns3,
  People: Users,
  Activity: History,
} as const;

/** Shared by every tab: open a commitment, assign it, take it. */
export type ProjectActions = {
  openWork: (id: number) => void;
  assign: (work: Work) => void;
  take: (work: Work) => void;
};

export function ProjectPage({
  projectId,
  tab,
  onTab,
}: {
  projectId: number;
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
}) {
  const state = useWorkspace();
  const nav = useWorkspaceNavigation();
  const { q = "" } = useWorkspaceSearch();
  const { data, error } = useQuery(projectQuery(projectId));
  const [assigning, setAssigning] = useState<Work | null>(null);
  const [selfAssign, setSelfAssign] = useState<Work | null>(null);

  if (error)
    return (
      <section className="panel">
        <Empty
          title="This project isn't available to you"
          description={error.message}
          action={
            <button className="button" onClick={() => nav.go("Projects")}>
              <ArrowLeft size={14} />
              Back to projects
            </button>
          }
        />
      </section>
    );
  if (!data)
    return (
      <section className="panel pj-loading" aria-busy="true">
        <Loader2 size={20} className="spin" />
        <span>Loading the project…</span>
      </section>
    );

  const needle = q.trim().toLowerCase();
  const works = needle
    ? data.work.filter((w) =>
        (w.title + " " + w.description).toLowerCase().includes(needle),
      )
    : data.work;
  const actions: ProjectActions = {
    openWork: (id) => void nav.openWork(id),
    assign: setAssigning,
    take: setSelfAssign,
  };

  return (
    <div className="pj">
      <ProjectSummary data={data} />
      <div
        className="pj-tabs context-tabs"
        role="tablist"
        aria-label="Project sections"
      >
        {PROJECT_TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "active" : ""}
              onClick={() => onTab(t)}
            >
              <Icon size={15} />
              {t}
              {t === "Commitments" && <small>{data.stats.total}</small>}
              {t === "People" && <small>{data.members.length}</small>}
            </button>
          );
        })}
      </div>
      {tab === "Overview" && (
        <ProjectOverview data={data} actions={actions} onTab={onTab} />
      )}
      {tab === "Commitments" && (
        <ProjectCommitments
          data={data}
          works={works}
          actions={actions}
          directory={state.directory}
        />
      )}
      {tab === "Board" && (
        <ProjectBoard
          data={data}
          works={works}
          actions={actions}
          directory={state.directory}
          userId={state.user.id}
        />
      )}
      {tab === "People" && (
        <ProjectPeople
          data={data}
          teams={state.teams}
          onProfile={(id) => void nav.openProfile(id)}
          onWork={actions.openWork}
        />
      )}
      {tab === "Activity" && (
        <ProjectActivity
          data={data}
          directory={state.directory}
          onWork={actions.openWork}
        />
      )}
      {(assigning || selfAssign) && (
        <AssignDialog
          work={(assigning || selfAssign)!}
          data={data}
          directory={state.directory}
          teams={state.teams}
          me={state.user}
          selfOnly={!!selfAssign}
          onClose={() => {
            setAssigning(null);
            setSelfAssign(null);
          }}
        />
      )}
    </div>
  );
}

/** Project facts in one container, tinted by the project's health. */
function ProjectSummary({ data }: { data: ProjectDetail }) {
  const state = useWorkspace();
  const { project, stats } = data;
  const lead = state.directory.find((p) => p.id === project.lead_id);
  return (
    <section
      className={"panel pj-summary tone-" + project.health.tone}
      style={{ "--project-color": project.color } as CSSProperties}
    >
      <div className="pj-summary-main">
        <Badge
          value={project.health.label}
          tone={healthTone(project.health.tone)}
        />
        <p>{project.description || "No description yet."}</p>
      </div>
      <dl className="pj-facts">
        <div>
          <dt>Department</dt>
          <dd>{project.team_name ?? "None"}</dd>
        </div>
        <div>
          <dt>Lead</dt>
          <dd>{lead?.name ?? "Not set"}</dd>
        </div>
        <div>
          <dt>Timeline</dt>
          <dd>
            {stats.start_date ? dateLabel(stats.start_date) : "Not started"}
            {" to "}
            {stats.target_date ? dateLabel(stats.target_date) : "open"}
          </dd>
        </div>
        <div className="pj-progress">
          <dt>Progress</dt>
          <dd>
            <span className="progress-track" aria-hidden="true">
              <i style={{ width: stats.progress + "%" }} />
            </span>
            {stats.progress}%
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ProjectOverview({
  data,
  actions,
  onTab,
}: {
  data: ProjectDetail;
  actions: ProjectActions;
  onTab: (tab: ProjectTab) => void;
}) {
  const state = useWorkspace();
  const now = useNow();
  const { stats } = data;
  const person = (id: number | null) =>
    state.directory.find((p) => p.id === id);
  const byId = new Map(data.work.map((w) => [w.id, w]));
  const upcoming = stats.next_due
    .map((id) => byId.get(id))
    .filter((w): w is Work => !!w);
  const openDeps = data.dependencies.filter(
    (d) => d.status !== "Verified" && d.status !== "Cancelled",
  );
  const attention = stats.needs_action + stats.needs_review;
  const departments = new Set(data.members.map((m) => m.team_id)).size;

  return (
    <>
      <dl className="pj-figures">
        <div className="panel">
          <dt>Progress</dt>
          <dd>
            <strong>{stats.progress}%</strong>
            <small>
              {stats.completed} of {stats.total} commitments complete
            </small>
          </dd>
        </div>
        <div className="panel">
          <dt>Open commitments</dt>
          <dd>
            <strong>{stats.active}</strong>
            <small>{stats.remaining_hours}h of work remaining</small>
          </dd>
        </div>
        <div
          className={
            "panel " +
            (stats.needs_action
              ? "tone-late"
              : stats.needs_review
                ? "tone-warn"
                : "tone-done")
          }
        >
          <dt>Need attention</dt>
          <dd>
            <strong>{attention}</strong>
            <small>
              {stats.overdue} overdue, {stats.needs_action} need action
            </small>
          </dd>
        </div>
        <div
          className={
            "panel " +
            (stats.unassigned
              ? "tone-warn"
              : stats.awaiting_confirmation
                ? ""
                : "tone-done")
          }
        >
          <dt>Unassigned</dt>
          <dd>
            <strong>{stats.unassigned}</strong>
            <small>
              {stats.awaiting_confirmation} waiting for the owner to confirm
            </small>
          </dd>
        </div>
      </dl>

      <div className="pj-columns">
        <div className="pj-column">
          <section className="panel pj-section">
            <h2>
              <CalendarClock size={16} />
              Coming up
            </h2>
            {upcoming.length ? (
              <ul className="pj-rows">
                {upcoming.map((w) => (
                  <li key={w.id} className={"tone-" + w.tone}>
                    <button
                      className="pj-row-title"
                      onClick={() => actions.openWork(w.id)}
                    >
                      {w.title}
                    </button>
                    <span className="pj-row-meta">
                      {w.owner_id ? (
                        <>
                          <Avatar person={person(w.owner_id)} size={20} />
                          {person(w.owner_id)?.name.split(" ")[0]}
                        </>
                      ) : (
                        "Unassigned"
                      )}
                    </span>
                    <span className="pj-row-date">
                      {dateLabel(w.due_date, data.today)}
                    </span>
                    <Badge value={w.health} tone={healthTone(w.tone)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pj-empty">No open commitments are scheduled.</p>
            )}
          </section>

          <section
            className={
              "panel pj-section" + (openDeps.length ? " tone-warn" : "")
            }
          >
            <h2>
              <Link2 size={16} />
              Blocked and waiting
            </h2>
            {openDeps.length ? (
              <ul className="pj-rows">
                {openDeps.map((d) => (
                  <li key={d.id} className={"pj-row-stack tone-" + d.tone}>
                    <span className="pj-row-main">
                      <button
                        className="pj-row-title"
                        onClick={() => actions.openWork(d.work_item_id)}
                      >
                        {d.deliverable}
                      </button>
                      <span className="pj-row-meta">
                        From {person(d.owner_id)?.name ?? "someone"}, for{" "}
                        {byId.get(d.work_item_id)?.title ?? "a commitment"}
                      </span>
                    </span>
                    <span className="pj-row-date">
                      {dateLabel(d.due_date, data.today)}
                    </span>
                    <Badge value={d.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pj-empty">Nothing in this project is blocked.</p>
            )}
          </section>
        </div>

        <div className="pj-column">
          <section className="panel pj-section">
            <h2>Status</h2>
            <ul className="pj-status">
              {Object.entries(stats.by_status).map(([status, count]) => (
                <li key={status}>
                  <Badge value={status} />
                  <span className="progress-track" aria-hidden="true">
                    <i
                      style={{
                        width: stats.total
                          ? (count / stats.total) * 100 + "%"
                          : 0,
                      }}
                    />
                  </span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel pj-section">
            <h2>
              <Users size={16} />
              People
            </h2>
            <p>
              {data.members.length} people from {departments}{" "}
              {departments === 1 ? "department" : "departments"}.
            </p>
            <div className="avatar-stack">
              {data.members.slice(0, 10).map((m) => (
                <Avatar key={m.id} person={m} size={28} />
              ))}
            </div>
            <button className="button" onClick={() => onTab("People")}>
              See everyone
            </button>
          </section>

          <section className="panel pj-section">
            <h2>
              <History size={16} />
              Latest updates
            </h2>
            {data.activity.length ? (
              <ul className="pj-feed">
                {data.activity.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Avatar person={person(a.actor_id)} size={22} />
                    <div>
                      <p>
                        <strong>{person(a.actor_id)?.name ?? "Someone"}</strong>{" "}
                        {a.message}
                      </p>
                      <small>{ago(a.created_at, now)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pj-empty">No updates yet.</p>
            )}
            <button className="button" onClick={() => onTab("Activity")}>
              All updates
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
