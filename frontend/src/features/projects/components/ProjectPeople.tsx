import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, LogOut, UserMinus, UserPlus } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { errorMessage } from "@/lib/forms";
import { showToast } from "@/lib/ui-store";
import { useWorkspace, useWorkspaceMutation } from "@/features/workspace/hooks";
import { addProjectMember, removeProjectMember } from "../api";
import type { Team } from "@/features/workspace/types";
import type { ProjectDetail } from "../api";

const INVOLVEMENT = {
  Department: "Owning department",
  Invited: "On the project",
  Contributor: "Owns work here",
} as const;

/** A button that asks once more before doing something hard to undo. */
function ConfirmButton({
  label,
  confirm,
  icon,
  disabled,
  onConfirm,
}: {
  label: string;
  confirm: string;
  icon: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={"button small pj-member-action" + (armed ? " is-armed" : "")}
      disabled={disabled}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {icon}
      {armed ? confirm : label}
    </button>
  );
}

/** Who is on the project: add people, remove them, or leave. The server enforces every rule. */
function MembershipBar({
  data,
  onLeft,
}: {
  data: ProjectDetail;
  onLeft: () => void;
}) {
  const state = useWorkspace();
  const [personId, setPersonId] = useState("");
  const projectId = data.project.id;
  const onProject = new Set(
    data.members
      .filter((m) => m.involvement !== "Contributor")
      .map((m) => m.id),
  );
  const candidates = state.directory
    .filter((p) => p.active && !onProject.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const add = useWorkspaceMutation(addProjectMember, (_, v) => {
    const name = state.directory.find((p) => p.id === v.employeeId)?.name;
    return `${name ?? "They"} can now see and work on this project.`;
  });
  const leave = useWorkspaceMutation(
    removeProjectMember,
    "You left the project.",
  );
  const { can_manage_members, can_leave } = data.permissions;
  if (!can_manage_members && !can_leave) return null;
  return (
    <section className="panel pj-membership">
      <div>
        <h2>People on this project</h2>
        <p>
          {onProject.size} {onProject.size === 1 ? "person" : "people"}. Only
          people on a project, and those above them, see its commitments.
        </p>
      </div>
      <div className="pj-membership-actions">
        {can_manage_members && (
          <form
            className="pj-add-person"
            onSubmit={(e) => {
              e.preventDefault();
              if (!personId) return;
              add.mutate(
                { projectId, employeeId: Number(personId) },
                {
                  onSuccess: () => setPersonId(""),
                  onError: (error) => showToast(errorMessage(error)),
                },
              );
            }}
          >
            <select
              aria-label="Person to add"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">Choose a teammate…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.title}
                </option>
              ))}
            </select>
            <button
              className="button small primary"
              disabled={!personId || add.isPending}
            >
              <UserPlus size={15} aria-hidden="true" />
              Add
            </button>
          </form>
        )}
        {can_leave && (
          <ConfirmButton
            label="Leave project"
            confirm="Leave? Click again"
            icon={<LogOut size={15} aria-hidden="true" />}
            disabled={leave.isPending}
            onConfirm={() =>
              leave.mutate(
                { projectId, employeeId: state.user.id },
                {
                  onSuccess: onLeft,
                  onError: (error) => showToast(errorMessage(error)),
                },
              )
            }
          />
        )}
      </div>
    </section>
  );
}

/** Everyone involved, each in a container tinted when their work here needs action. */
export function ProjectPeople({
  data,
  teams,
  onProfile,
  onWork,
  onLeft,
}: {
  data: ProjectDetail;
  teams: Team[];
  onProfile: (id: number) => void;
  onWork: (id: number) => void;
  /** After leaving: the project may no longer be visible. */
  onLeft: () => void;
}) {
  const state = useWorkspace();
  const team = (id: number) => teams.find((t) => t.id === id)?.name;
  const remove = useWorkspaceMutation(removeProjectMember, (_, v) => {
    const name = data.members.find((m) => m.id === v.employeeId)?.name;
    return `${name ?? "They"} left the project.`;
  });
  const canRemove = (m: ProjectDetail["members"][number]) =>
    data.permissions.can_manage_members &&
    m.involvement !== "Contributor" &&
    m.id !== state.user.id;
  return (
    <div className="pj-people-page">
      <MembershipBar data={data} onLeft={onLeft} />
      <div className="pj-people">
        {data.members.map((m) => {
          const open = data.work.filter(
            (w) => w.owner_id === m.id && w.status !== "Completed",
          );
          return (
            <section
              key={m.id}
              className={
                "panel pj-person" + (m.needs_action ? " tone-late" : "")
              }
            >
              <div className="pj-person-head">
                <Avatar person={m} size={38} />
                <div>
                  {m.can_view_profile ? (
                    <button
                      className="pj-person-name"
                      onClick={() => onProfile(m.id)}
                    >
                      {m.name}
                      <ArrowUpRight size={13} />
                    </button>
                  ) : (
                    <strong className="pj-person-name">{m.name}</strong>
                  )}
                  <small>
                    {m.title}
                    {team(m.team_id) ? `, ${team(m.team_id)}` : ""}
                  </small>
                </div>
              </div>
              <div className="pj-person-badges">
                {m.is_lead && <Badge value="Lead" tone="purple" plain />}
                <Badge
                  value={INVOLVEMENT[m.involvement]}
                  tone="neutral"
                  plain
                />
                {m.needs_action > 0 && (
                  <Badge value={`${m.needs_action} need action`} tone="red" />
                )}
              </div>
              <dl className="pj-person-stats">
                <div>
                  <dt>Open</dt>
                  <dd>{m.open_count}</dd>
                </div>
                <div>
                  <dt>Done</dt>
                  <dd>{m.completed_count}</dd>
                </div>
                <div>
                  <dt>Hours left</dt>
                  <dd>{m.remaining_hours}</dd>
                </div>
              </dl>
              {open.length > 0 && (
                <ul className="pj-person-work">
                  {open.slice(0, 3).map((w) => (
                    <li key={w.id}>
                      <button onClick={() => onWork(w.id)}>{w.title}</button>
                    </li>
                  ))}
                  {open.length > 3 && (
                    <li className="muted">and {open.length - 3} more</li>
                  )}
                </ul>
              )}
              {canRemove(m) && (
                <ConfirmButton
                  label="Remove"
                  confirm="Remove? Click again"
                  icon={<UserMinus size={14} aria-hidden="true" />}
                  disabled={remove.isPending}
                  onConfirm={() =>
                    remove.mutate(
                      { projectId: data.project.id, employeeId: m.id },
                      { onError: (error) => showToast(errorMessage(error)) },
                    )
                  }
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
