import React from "react";
import { useState, FormEvent } from "react";
import {
  Users,
  Plus,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Check,
  GitBranch,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import { Avatar, Modal } from "../../components/ui";
import { ReportingForm } from "./ReportingForm";
import { api, State, DirectoryPerson, Team, summarizeHealth } from "../../lib";

export function Organization({
  state,
  onProfile,
  onDone,
  onAddEmployee,
}: {
  state: State;
  onProfile: (id: number) => void;
  onDone: (s: string) => Promise<void>;
  onAddEmployee: () => void;
}) {
  const [mode, setMode] = useState("Org tree"),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState<Set<number>>(() => {
      const ancestors = new Set([state.user.id]);
      let person = state.directory.find((p) => p.id === state.user.id);
      while (person?.manager_id && !ancestors.has(person.manager_id)) {
        ancestors.add(person.manager_id);
        person = state.directory.find((p) => p.id === person!.manager_id);
      }
      return new Set(
        state.directory
          .filter(
            (p) =>
              p.manager_id !== null &&
              !ancestors.has(p.id) &&
              state.directory.some((report) => report.manager_id === p.id),
          )
          .map((p) => p.id),
      );
    }),
    [collapsedDepartments, setCollapsedDepartments] = useState<Set<number>>(
      () =>
        new Set(
          state.teams
            .filter((team) => team.id !== state.user.team_id)
            .map((team) => team.id),
        ),
    ),
    [showInactive, setShowInactive] = useState(false),
    [teamForm, setTeamForm] = useState<Team | "new" | null>(null),
    [editing, setEditing] = useState<DirectoryPerson | null>(null);
  const people = state.directory;
  const visible = people.filter((p) => p.active || showInactive);
  const departments = state.teams;
  function toggleDepartment(id: number) {
    setCollapsedDepartments((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const matches = (p: DirectoryPerson) =>
    !search ||
    (
      p.name +
      " " +
      p.title +
      " " +
      state.teams.find((t) => t.id === p.team_id)?.name
    )
      .toLowerCase()
      .includes(search.toLowerCase());
  function toggle(id: number) {
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function personNode(
    p: DirectoryPerson,
    seen: number[] = [],
  ): React.ReactNode {
    if (seen.includes(p.id)) return null;
    const children = visible.filter((c) => c.manager_id === p.id);
    const subtreeMatches = (id: number, visited: number[] = []): boolean => {
      if (visited.includes(id)) return false;
      const person = visible.find((p) => p.id === id);
      return (
        !!person &&
        (matches(person) ||
          visible
            .filter((c) => c.manager_id === id)
            .some((c) => subtreeMatches(c.id, [...visited, id])))
      );
    };
    if (!subtreeMatches(p.id)) return null;
    const health = p.can_view_profile
      ? summarizeHealth(state.work.filter((w) => w.owner_id === p.id))
      : null;
    return (
      <li key={p.id}>
        <div
          className={"org-person " + (p.id === state.user.id ? "is-you" : "")}
        >
          <button
            className="tree-expander"
            aria-label={
              (collapsed.has(p.id) && !search ? "Expand " : "Collapse ") +
              p.name
            }
            aria-expanded={
              children.length ? !collapsed.has(p.id) || !!search : undefined
            }
            disabled={!children.length}
            onClick={() => toggle(p.id)}
          >
            {children.length ? (
              collapsed.has(p.id) ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )
            ) : (
              <span />
            )}
          </button>
          <Avatar person={p} size={36} />
          <div className="org-person-name">
            <strong>
              {p.name}
              {p.id === state.user.id && <span className="you-tag">You</span>}
              {!p.active && <span className="you-tag">Inactive</span>}
            </strong>
            <small>
              {p.title} · {state.teams.find((t) => t.id === p.team_id)?.name}
            </small>
          </div>
          {health && (
            <span className={"health-label " + health.tone}>
              {health.label}
            </span>
          )}
          <div className="org-node-actions">
            {state.can_manage_org && (
              <button
                className="icon-button"
                aria-label={"Edit reporting for " + p.name}
                onClick={() => setEditing(p)}
              >
                <Pencil size={14} />
              </button>
            )}
            {p.can_view_profile ? (
              <button className="button small" onClick={() => onProfile(p.id)}>
                Profile
                <ArrowUpRight size={13} />
              </button>
            ) : (
              <span
                className="scope-lock"
                title="Full profiles follow your reporting permissions"
              >
                <LockKeyhole size={13} />
                Directory only
              </span>
            )}
          </div>
        </div>
        {children.length > 0 && (!collapsed.has(p.id) || search) && (
          <ul>{children.map((c) => personNode(c, [...seen, p.id]))}</ul>
        )}
      </li>
    );
  }
  function teamNode(t: Team, seen: number[] = []): React.ReactNode {
    if (seen.includes(t.id)) return null;
    const children = departments.filter((c) => c.parent_id === t.id);
    const members = visible.filter((p) => p.team_id === t.id);
    const departmentMatch = t.name.toLowerCase().includes(search.toLowerCase());
    const found = members.filter((p) => departmentMatch || matches(p));
    if (search && !departmentMatch && !found.length && !children.length)
      return null;
    const expanded = !collapsedDepartments.has(t.id) || !!search;
    return (
      <li key={t.id} className="department-branch">
        <div className="team-tree-heading">
          <button
            className="department-expander"
            aria-label={
              (expanded ? "Collapse " : "Expand ") + t.name + " department"
            }
            aria-expanded={expanded}
            onClick={() => toggleDepartment(t.id)}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="team-tree-icon">
              <Users size={19} />
            </span>
            <span>
              <strong>{t.name}</strong>
              <small>
                {members.length} members
                {children.length
                  ? " · " + children.length + " subdepartments"
                  : ""}
              </small>
            </span>
          </button>
          {state.can_manage_org && (
            <button className="button small" onClick={() => setTeamForm(t)}>
              <Pencil size={12} />
              Edit department
            </button>
          )}
        </div>
        {expanded && (
          <>
            <div className="team-tree-members">
              {found.map((p) => (
                <button
                  key={p.id}
                  disabled={!p.can_view_profile}
                  onClick={() => onProfile(p.id)}
                  title={
                    p.can_view_profile
                      ? "Open work profile"
                      : "Directory only · outside your reporting branch"
                  }
                >
                  <Avatar person={p} size={30} />
                  <span>
                    {p.name}
                    <small>
                      {p.manager_id
                        ? "Reports to " +
                          (people.find((manager) => manager.id === p.manager_id)
                            ?.name || "unavailable manager")
                        : "Organization lead"}
                    </small>
                  </span>
                  {p.can_view_profile ? (
                    <ArrowUpRight size={13} />
                  ) : (
                    <LockKeyhole size={12} />
                  )}
                </button>
              ))}
            </div>
            {children.length > 0 && (
              <ul>
                {children.map((child) => teamNode(child, [...seen, t.id]))}
              </ul>
            )}
          </>
        )}
      </li>
    );
  }
  async function saveTeam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name")),
      parent_id: f.get("parent_id") ? Number(f.get("parent_id")) : null,
      lead_id: f.get("lead_id") ? Number(f.get("lead_id")) : null,
    };
    await api(
      "/teams" + (teamForm !== "new" && teamForm ? "/" + teamForm.id : ""),
      body,
      teamForm === "new" ? "POST" : "PATCH",
    );
    await onDone("Department saved.");
    setTeamForm(null);
  }
  return (
    <>
      <section className="organization-intro">
        <span className="organization-symbol">
          <GitBranch size={26} />
        </span>
        <div>
          <h2>Everyone has a place in the picture.</h2>
          <p>
            Explore reporting lines and departments. Full work profiles follow
            your access permissions.
          </p>
        </div>
        <div className="org-count">
          <strong>{visible.length}</strong>
          <span>people</span>
          <strong>{departments.length}</strong>
          <span>departments</span>
        </div>
      </section>
      <div className="section-toolbar">
        <div className="segmented">
          {["Org tree", "Department tree"].map((t) => (
            <button
              key={t}
              className={mode === t ? "active" : ""}
              onClick={() => setMode(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="org-toolbar-actions">
          {state.can_manage_org && (
            <label className="inactive-toggle">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Include inactive
            </label>
          )}
          <input
            aria-label="Find a person in the organization"
            placeholder="Find a person or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {state.can_manage_org && (
            <>
              <button
                className="button small"
                onClick={() => setTeamForm("new")}
              >
                <Plus size={13} />
                New department
              </button>
              <button className="button primary small" onClick={onAddEmployee}>
                <Plus size={13} />
                Add teammate
              </button>
            </>
          )}
        </div>
      </div>
      <section className="panel org-tree-panel">
        <div className="panel-heading">
          <div>
            <h2>FloData Analytics</h2>
            <p>
              {mode === "Org tree"
                ? "Who reports to whom · click an authorized profile to inspect work"
                : "People grouped by department · reporting lines remain visible in the org tree"}
            </p>
          </div>
          <GitBranch size={19} />
        </div>
        {mode === "Org tree" ? (
          <div
            className="organization-tree-scroll"
            role="region"
            aria-label="Organization hierarchy"
            tabIndex={0}
          >
            <ul className="org-tree">
              {visible
                .filter(
                  (p) =>
                    !p.manager_id ||
                    !visible.some((m) => m.id === p.manager_id),
                )
                .map((p) => personNode(p))}
            </ul>
          </div>
        ) : (
          <div
            className="organization-tree-scroll"
            role="region"
            aria-label="Department membership"
            tabIndex={0}
          >
            <ul className="team-tree">
              {departments
                .filter(
                  (t) =>
                    !t.parent_id ||
                    !departments.some((p) => p.id === t.parent_id),
                )
                .map((t) => teamNode(t))}
            </ul>
          </div>
        )}
      </section>
      <div className="info-strip">
        <LockKeyhole size={16} />
        <p>
          The tree shares organization structure, not private work profiles,
          capacity records, or assistant conversations. Managers can inspect
          direct and indirect reports. The employer can inspect the
          organization.
        </p>
      </div>
      {editing && (
        <ReportingForm
          state={state}
          person={editing}
          onClose={() => setEditing(null)}
          onDone={onDone}
        />
      )}{" "}
      {teamForm && (
        <TeamDialog
          state={state}
          team={teamForm}
          onClose={() => setTeamForm(null)}
          submit={saveTeam}
        />
      )}
    </>
  );
}

function TeamDialog({
  state,
  team,
  onClose,
  submit,
}: {
  state: State;
  team: Team | "new";
  onClose: () => void;
  submit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={team === "new" ? "Create a department" : "Edit " + team.name}
      subtitle="Departments group members; individual reporting lines are managed separately."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await submit(e);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Department name
          <input
            name="name"
            defaultValue={team === "new" ? "" : team.name}
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <label>
          Parent department
          <select
            name="parent_id"
            defaultValue={team === "new" ? "" : (team.parent_id ?? "")}
          >
            <option value="">Top-level department</option>
            {state.teams
              .filter((t) => team === "new" || t.id !== team.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Department lead
          <select
            name="lead_id"
            defaultValue={team === "new" ? "" : (team.lead_id ?? "")}
          >
            <option value="">Not assigned</option>
            {state.directory
              .filter((p) => p.active && ["manager", "admin"].includes(p.role))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Check size={14} />
            Save department
          </button>
        </div>
      </form>
    </Modal>
  );
}
