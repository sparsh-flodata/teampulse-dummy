import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link2,
  ArrowUpRight,
  Clock3,
  Loader2,
  Flag,
  GitBranch,
  CheckCircle2,
  ArrowLeft,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import { Avatar, Badge, Empty } from "@/components/ui";
import { ago } from "@/lib/format";
import { DependencyCard } from "@/features/work/components/DependencyCard";
import { WorkTable } from "@/features/work/components/WorkTable";
import { isManager, openDependency } from "@/features/workspace/domain";
import { useNow, useWorkspace } from "@/features/workspace/hooks";
import { useWorkspaceNavigation } from "@/features/workspace/navigation";
import { profileQuery } from "../api";
import { HealthSignal } from "./HealthSignal";
import { ReportingForm } from "./ReportingForm";
import { ReportingTeam } from "./ReportingTeam";

export function ProfilePage({ personId }: { personId: number }) {
  const state = useWorkspace();
  const nav = useWorkspaceNavigation();
  const now = useNow();
  const [tab, setTab] = useState("Commitments"),
    [editing, setEditing] = useState(false);
  const { data, error } = useQuery(profileQuery(personId));
  const back = () => nav.go(isManager(state.user) ? "My team" : "Overview");
  const openWork = (id: number) => nav.openWork(id);

  if (error)
    return (
      <section className="panel">
        <Empty
          title="This profile is outside your access scope"
          description={error.message}
          action={
            <button className="button" onClick={back}>
              <ArrowLeft size={14} />
              Back to workspace
            </button>
          }
        />
      </section>
    );
  if (!data)
    return (
      <div className="profile-loading">
        <Loader2 size={22} className="spin" />
        <span>Loading the work profile…</span>
      </div>
    );
  const p = data.person,
    own = p.id === state.user.id,
    directory = state.directory.find((d) => d.id === p.id),
    active = data.work.filter((w) => w.status !== "Completed"),
    deps = data.dependencies.filter(openDependency),
    c = p.capacity;
  return (
    <div className="profile-page">
      <div className="profile-topline">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={14} />
          Back to workspace
        </button>
        {data.can_manage && (
          <button className="button small" onClick={() => setEditing(true)}>
            <Pencil size={13} />
            Edit reporting
          </button>
        )}
      </div>
      <section className={"profile-hero tone-" + data.health.tone}>
        <Avatar person={p} size={68} />
        <div className="profile-identity">
          <span className="eyebrow">
            {own ? "Your work profile" : "Individual work profile"}
          </span>
          <h2>
            {p.name}
            {own && <span className="you-tag">You</span>}
          </h2>
          <p>
            {p.title} · {state.teams.find((t) => t.id === p.team_id)?.name}
          </p>
          <div className="reporting-line">
            <GitBranch size={13} />
            {data.manager ? (
              <>
                Reports to{" "}
                <button
                  disabled={!data.manager.can_view_profile}
                  onClick={() => nav.openProfile(data.manager!.id)}
                >
                  {data.manager.name}
                </button>
              </>
            ) : (
              "Organization leadership"
            )}
            <span>·</span>
            {data.reports.filter((d) => d.active).length} direct reports
          </div>
        </div>
        <HealthSignal health={data.health} compact />
      </section>
      <div className="profile-stat-grid">
        {[
          { v: active.length, l: "Active commitments", icon: CheckCircle2 },
          { v: data.health.counts.red, l: "Need action", icon: Flag },
          { v: deps.length, l: "Shared dependencies", icon: Link2 },
          {
            v: c.available === null ? "Unknown" : c.available + "h",
            l: "Confirmed room",
            icon: Clock3,
          },
        ].map((x) => (
          <div className="panel profile-stat" key={x.l}>
            <x.icon size={16} />
            <strong>{x.v}</strong>
            <span>{x.l}</span>
          </div>
        ))}
      </div>
      <ReportingTeam
        key={p.id}
        reports={data.reports}
        state={state}
        onProfile={nav.openProfile}
      />
      <div className="profile-layout">
        <section className="panel profile-work-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {own
                  ? "Your commitments"
                  : p.name.split(" ")[0] + "’s commitments"}
              </h2>
              <p>Work, delivery context, and the reasons behind changes.</p>
            </div>
          </div>
          <div className="tabs profile-tabs">
            {["Commitments", "Dependencies", "History"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Commitments" && (
            <WorkTable
              works={data.work}
              state={state}
              onWork={(w) => openWork(w.id)}
              onPerson={(person) => nav.openProfile(person.id)}
            />
          )}
          {tab === "Dependencies" && (
            <div className="profile-dependencies">
              {data.dependencies.length ? (
                data.dependencies.map((d) => (
                  <DependencyCard
                    key={d.id}
                    dep={d}
                    state={state}
                    onWork={(w) => openWork(w.id)}
                  />
                ))
              ) : (
                <Empty
                  title="No shared dependencies"
                  description="There are no recorded dependencies for this profile."
                />
              )}
            </div>
          )}
          {tab === "History" && (
            <div className="activity-list">
              {data.activity.length ? (
                data.activity.map((a) => (
                  <div className="activity-event" key={a.id}>
                    <Avatar
                      person={state.directory.find((p) => p.id === a.actor_id)}
                      size={30}
                    />
                    <div>
                      <p>{a.message}</p>
                      <small>{ago(a.created_at, now)}</small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Open related commitment"
                      onClick={() => {
                        const w = data.work.find(
                          (w) => w.id === a.work_item_id,
                        );
                        if (w) void openWork(w.id);
                      }}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <Empty
                  title="A fresh start"
                  description="Work updates will appear here as commitments evolve."
                />
              )}
            </div>
          )}
        </section>
        <aside className="profile-aside">
          <section className="panel profile-capacity">
            <h3>Room for the right work</h3>
            <p>
              Next five workdays ·{" "}
              {c.confirmed
                ? "availability confirmed"
                : "availability not confirmed"}
            </p>
            <Badge value={c.state} />
            <div className="capacity-bar">
              <i
                className="committed"
                style={{
                  width:
                    Math.min(100, (c.committed / (p.weekly_hours || 1)) * 100) +
                    "%",
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
            <dl>
              <div>
                <dt>Working hours</dt>
                <dd>{p.weekly_hours}h</dd>
              </div>
              <div>
                <dt>Reserved time</dt>
                <dd>{p.reserved_hours}h</dd>
              </div>
              <div>
                <dt>Committed effort</dt>
                <dd>{c.committed}h</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>
                  {c.available === null ? "Not confirmed" : c.available + "h"}
                </dd>
              </div>
            </dl>
            <p className="capacity-note">
              {c.confirmed
                ? "Availability was confirmed within the last seven days."
                : "Confirm availability before proposing additional work."}{" "}
              Blocked work still counts as committed effort.
            </p>
            <h4>Skills & expertise</h4>
            <div className="skill-tags">
              {p.skills
                .split(",")
                .filter(Boolean)
                .map((s) => (
                  <span key={s}>{s.trim()}</span>
                ))}
            </div>
          </section>
          <div className="privacy-note">
            <LockKeyhole size={13} />
            Private assistant conversations are never included in this profile.
          </div>
        </aside>
      </div>
      {editing && directory && (
        <ReportingForm
          state={state}
          person={directory}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
