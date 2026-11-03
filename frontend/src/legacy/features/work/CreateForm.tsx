import React from "react";
import { useState, FormEvent } from "react";
import { Link2, Check, Clock3, AlertCircle, Loader2 } from "lucide-react";
import { Modal } from "../../components/ui";
import { api, State, Work, isManager, isProjectParticipant } from "../../lib";

export type FormKind = "work" | "project" | "employee" | "dependency";
export function CreateForm({
  kind,
  state,
  work,
  onClose,
  onDone,
}: {
  kind: FormKind;
  state: State;
  work?: Work;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [projectId, setProjectId] = useState(
      work?.project_id || state.projects[0]?.id || 0,
    );
  const project = state.projects.find((p) => p.id === projectId),
    teamPeople = state.employees.filter((p) =>
      isProjectParticipant(p, project),
    );
  const titles = {
    work: "A new commitment",
    project: "Create a project",
    employee: "Welcome a teammate",
    dependency: "Make a dependency visible",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      s = (k: string) => String(f.get(k) || ""),
      n = (k: string) => Number(f.get(k));
    let body: unknown,
      path = "";
    if (kind === "work") {
      path = "/work";
      body = {
        title: s("title"),
        description: s("description"),
        project_id: n("project_id"),
        owner_id: s("owner_id") ? n("owner_id") : null,
        priority: s("priority"),
        due_date: s("due_date"),
        effort_hours: n("effort_hours"),
        required_skills: s("required_skills"),
      };
    }
    if (kind === "project") {
      path = "/projects";
      body = {
        name: s("name"),
        description: s("description"),
        team_id: n("team_id"),
        color: s("color"),
      };
    }
    if (kind === "employee") {
      path = "/employees";
      body = {
        name: s("name"),
        email: s("email"),
        password: s("password"),
        title: s("title"),
        team_id: n("team_id"),
        skills: s("skills"),
        role: s("role"),
        manager_id: s("manager_id") ? n("manager_id") : state.user.id,
      };
    }
    if (kind === "dependency") {
      path = "/dependencies";
      body = {
        work_item_id: work?.id,
        owner_id: n("owner_id"),
        upstream_work_id: s("upstream_work_id") ? n("upstream_work_id") : null,
        deliverable: s("deliverable"),
        reason: s("reason"),
        due_date: s("due_date"),
        impact: s("impact"),
        partial: s("partial") === "partial",
      };
    }
    try {
      await api(path, body);
      await onDone(
        kind === "dependency"
          ? "Dependency recorded. The owner has an in-app notification."
          : kind === "work"
            ? "Commitment created."
            : "Workspace updated.",
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={titles[kind]}
      subtitle={
        kind === "dependency"
          ? "Capture what is needed, who owns it, and what can continue."
          : "Make the next step clear. You can refine it as work evolves."
      }
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        {kind === "work" && (
          <>
            <label>
              What needs to be delivered?
              <input
                name="title"
                placeholder="e.g. Complete the property dashboard API"
                minLength={3}
                maxLength={200}
                required
                autoFocus
              />
            </label>
            <label>
              Scope & context
              <textarea
                name="description"
                placeholder="What does done look like?"
                maxLength={4000}
              />
            </label>
            <div className="form-grid">
              <label>
                Project
                <select
                  name="project_id"
                  value={projectId}
                  onChange={(e) => setProjectId(+e.target.value)}
                >
                  {state.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  key={projectId}
                  name="owner_id"
                  defaultValue={
                    teamPeople.some((p) => p.id === state.user.id)
                      ? state.user.id
                      : ""
                  }
                >
                  {isManager(state.user) && (
                    <option value="">Unassigned · decide later</option>
                  )}
                  {teamPeople
                    .filter(
                      (p) => isManager(state.user) || p.id === state.user.id,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Estimated effort (hours)
                <input
                  name="effort_hours"
                  type="number"
                  defaultValue={4}
                  min={0.5}
                  max={1000}
                  step={0.5}
                  required
                />
              </label>
              <label>
                Expected completion
                <input
                  name="due_date"
                  type="date"
                  min={state.today}
                  defaultValue={state.today}
                  required
                />
              </label>
              <label>
                Priority
                <select name="priority" defaultValue="Medium">
                  {["Low", "Medium", "High", "Urgent"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Relevant skills
                <input
                  name="required_skills"
                  placeholder="React, Python…"
                  maxLength={500}
                />
              </label>
            </div>
            <div className="form-note">
              <Clock3 size={16} />
              Effort is working time. The completion date is a separate
              commitment.
            </div>
          </>
        )}
        {kind === "project" && (
          <>
            <label>
              Project name
              <input
                name="name"
                minLength={2}
                maxLength={120}
                required
                autoFocus
              />
            </label>
            <label>
              Purpose
              <textarea
                name="description"
                maxLength={2000}
                placeholder="What will this project make possible?"
              />
            </label>
            <div className="form-grid">
              <label>
                Team
                <select name="team_id">
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project color
                <select name="color">
                  <option value="#7256df">Iris</option>
                  <option value="#278d88">Sage</option>
                  <option value="#d58a43">Amber</option>
                  <option value="#c96388">Rose</option>
                </select>
              </label>
            </div>
          </>
        )}
        {kind === "employee" && (
          <>
            <div className="form-grid">
              <label>
                Full name
                <input
                  name="name"
                  minLength={2}
                  maxLength={120}
                  required
                  autoFocus
                />
              </label>
              <label>
                Work email
                <input name="email" type="email" maxLength={254} required />
              </label>
              <label>
                Job title
                <input
                  name="title"
                  defaultValue="Team member"
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Team
                <select name="team_id">
                  {state.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select name="role">
                  <option value="employee">Employee</option>
                  {state.can_manage_org && (
                    <option value="manager">Manager</option>
                  )}
                </select>
              </label>
              <label>
                Initial password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>
            {state.can_manage_org && (
              <label>
                Reports to
                <select name="manager_id" defaultValue={state.user.id}>
                  {state.directory
                    .filter(
                      (p) => p.active && ["manager", "admin"].includes(p.role),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Skills
              <input
                name="skills"
                placeholder="Comma-separated skills"
                maxLength={500}
              />
            </label>
            <p className="form-note">
              Share the initial password with your teammate through your usual
              secure channel. No email is sent.
            </p>
          </>
        )}
        {kind === "dependency" && (
          <>
            <div className="form-note">
              <Link2 size={16} />
              {work?.title}
            </div>
            <label>
              Required deliverable
              <input
                name="deliverable"
                placeholder="e.g. Updated database schema"
                minLength={3}
                maxLength={200}
                required
                autoFocus
              />
            </label>
            <div className="form-grid">
              <label>
                Responsible person
                <select name="owner_id" required>
                  {state.directory
                    .filter((p) => isProjectParticipant(p, project))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Expected delivery
                <input
                  name="due_date"
                  type="date"
                  defaultValue={state.today}
                  required
                />
              </label>
              <label>
                Impact
                <select name="impact" defaultValue="High">
                  {["Low", "Medium", "High", "Critical"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Can other work continue?
                <select name="partial">
                  <option value="partial">Yes · partially blocked</option>
                  <option value="full">No · fully blocked</option>
                </select>
              </label>
            </div>
            <label>
              Related upstream work (optional)
              <select name="upstream_work_id">
                <option value="">A deliverable outside recorded work</option>
                {state.work
                  .filter((w) => w.id !== work?.id && w.status !== "Completed")
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Why is it needed?
              <textarea
                name="reason"
                placeholder="Explain the effect on your commitment."
                maxLength={2000}
              />
            </label>
          </>
        )}
        {error && (
          <div className="error" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {kind === "work"
              ? "Create commitment"
              : kind === "dependency"
                ? "Record dependency"
                : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
