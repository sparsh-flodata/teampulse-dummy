import { useState } from "react";
import { FolderKanban, Plus, ArrowUpRight, UserRound } from "lucide-react";
import { Avatar, Badge, healthTone } from "@/components/ui";
import { isManager } from "@/features/workspace/domain";
import { useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";

export function ProjectsPage() {
  const state = useWorkspace();
  const { q: search = "" } = useWorkspaceSearch();
  const nav = useWorkspaceNavigation();
  const manager = isManager(state.user);
  const [mine, setMine] = useState(false);
  const isMine = (p: (typeof state.projects)[number]) =>
    p.member_ids.includes(state.user.id);
  const myCount = state.projects.filter(isMine).length;
  return (
    <div className="projects-page">
      <div
        className="context-tabs projects-scope"
        role="tablist"
        aria-label="Which projects"
      >
        <button
          role="tab"
          aria-selected={!mine}
          className={!mine ? "active" : ""}
          onClick={() => setMine(false)}
        >
          <FolderKanban size={15} aria-hidden="true" />
          All you can see
          <small>{state.projects.length}</small>
        </button>
        <button
          role="tab"
          aria-selected={mine}
          className={mine ? "active" : ""}
          onClick={() => setMine(true)}
        >
          <UserRound size={15} aria-hidden="true" />
          My projects
          <small>{myCount}</small>
        </button>
      </div>
      <div className="project-grid">
        {state.projects
          .filter(
            (p) =>
              (!mine || isMine(p)) &&
              (!search ||
                (p.name + " " + p.description)
                  .toLowerCase()
                  .includes(search.toLowerCase())),
          )
          .map((p) => {
            const works = state.work.filter((w) => w.project_id === p.id),
              people = state.directory.filter(
                (e) => e.active && p.member_ids.includes(e.id),
              ),
              done = works.filter((w) => w.status === "Completed").length,
              avg = works.length
                ? Math.round(
                    works.reduce((s, w) => s + w.progress, 0) / works.length,
                  )
                : 0;
            return (
              <button
                className={"project-card tone-" + p.health.tone}
                key={p.id}
                onClick={() => nav.openProject(p.id)}
              >
                <div className="split">
                  <span
                    className="project-symbol"
                    style={{ color: p.color, background: p.color + "14" }}
                  >
                    <FolderKanban size={23} />
                  </span>
                  <ArrowUpRight size={19} />
                </div>
                <h2>{p.name}</h2>
                <Badge
                  value={p.health.label}
                  tone={healthTone(p.health.tone)}
                />
                <p>
                  {p.description || "A shared initiative with room to grow."}
                </p>
                <div className="project-collaboration">
                  {people.length} participants ·{" "}
                  {new Set(people.map((person) => person.team_id)).size}{" "}
                  departments
                </div>
                {isMine(p) && <Badge value="You're on it" tone="green" plain />}
                <div className="project-stats">
                  <span>{works.length} commitments in view</span>
                  <span>{done} completed</span>
                </div>
                <div className="project-progress">
                  <div className="progress-track">
                    <i style={{ width: avg + "%", background: p.color }} />
                  </div>
                  <span>{avg}%</span>
                </div>
                <div className="project-card-footer">
                  <div className="avatar-stack">
                    {people.slice(0, 4).map((e) => (
                      <Avatar key={e.id} person={e} size={29} />
                    ))}
                  </div>
                  <small>
                    {state.teams.find((t) => t.id === p.team_id)?.name}
                  </small>
                </div>
              </button>
            );
          })}
        {manager && (
          <button
            className="add-project-card"
            onClick={() => nav.openCreate("project")}
          >
            <span>
              <Plus size={26} />
            </span>
            <h3>Make space for something new.</h3>
            <p>Create a project for your next shared goal.</p>
          </button>
        )}
      </div>
    </div>
  );
}
