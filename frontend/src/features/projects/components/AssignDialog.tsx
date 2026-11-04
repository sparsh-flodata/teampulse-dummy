import { useState } from "react";
import { Search } from "lucide-react";
import { Avatar, FormError, Modal, SubmitButton } from "@/components/ui";
import { errorMessage } from "@/lib/forms";
import { assignWork } from "@/features/work/api";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type {
  DirectoryPerson,
  Person,
  Team,
  Work,
} from "@/features/workspace/types";
import type { ProjectDetail } from "../api";

/**
 * Assign or reassign a commitment (managers and administrators: anyone in the
 * organization), or take an unassigned one yourself (selfOnly).
 */
export function AssignDialog({
  work,
  data,
  directory,
  teams,
  me,
  selfOnly,
  onClose,
}: {
  work: Work;
  data: ProjectDetail;
  directory: DirectoryPerson[];
  teams: Team[];
  me: Person;
  selfOnly: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<number | null>(selfOnly ? me.id : null);
  const owner = directory.find((p) => p.id === work.owner_id);
  const assign = useWorkspaceMutation(assignWork, (_r, v) =>
    v.employee_id === me.id
      ? "It's yours now."
      : `Assigned to ${directory.find((p) => p.id === v.employee_id)?.name}. They'll be asked to confirm.`,
  );
  const memberIds = new Set(data.members.map((m) => m.id));
  const needle = query.trim().toLowerCase();
  const team = (id: number) => teams.find((t) => t.id === id)?.name ?? "";
  const candidates = directory
    .filter((p) => p.active && p.id !== work.owner_id)
    .filter(
      (p) =>
        !needle ||
        (p.name + " " + p.title + " " + team(p.team_id))
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = [
    {
      label: "On this project",
      people: candidates.filter((p) => memberIds.has(p.id)),
    },
    {
      label: "Elsewhere in the organization (they join the project)",
      people: candidates.filter((p) => !memberIds.has(p.id)),
    },
  ];
  const target = directory.find((p) => p.id === chosen);

  const submit = async () => {
    if (!chosen) return;
    try {
      await assign.mutateAsync({ id: work.id, employee_id: chosen });
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Modal
      title={
        selfOnly
          ? "Take this commitment"
          : owner
            ? "Reassign commitment"
            : "Assign commitment"
      }
      subtitle={work.title}
      onClose={onClose}
    >
      <form
        className="form pj-assign"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {selfOnly ? (
          <p>
            It becomes your commitment straight away, due {work.due_date} with{" "}
            {work.remaining_hours}h of work left. You can update the plan from
            the commitment itself.
          </p>
        ) : (
          <>
            <label className="pj-assign-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, role or department"
                aria-label="Search people"
                autoFocus
              />
            </label>
            <div
              className="pj-assign-list"
              role="radiogroup"
              aria-label="Choose a person"
            >
              {groups.map(
                (g) =>
                  g.people.length > 0 && (
                    <fieldset key={g.label}>
                      <legend>{g.label}</legend>
                      {g.people.map((p) => (
                        <label
                          key={p.id}
                          className={
                            "pj-assign-person" +
                            (chosen === p.id ? " is-chosen" : "")
                          }
                        >
                          <input
                            type="radio"
                            name="assignee"
                            value={p.id}
                            checked={chosen === p.id}
                            onChange={() => setChosen(p.id)}
                          />
                          <Avatar person={p} size={26} />
                          <span>
                            <strong>
                              {p.name}
                              {p.id === me.id ? " (you)" : ""}
                            </strong>
                            <small>
                              {p.title}
                              {team(p.team_id) ? `, ${team(p.team_id)}` : ""}
                            </small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ),
              )}
              {!candidates.length && (
                <p className="pj-empty">No one matches that search.</p>
              )}
            </div>
            <p className="pj-assign-note">
              {target?.id === me.id
                ? "It becomes your commitment straight away."
                : target
                  ? `${target.name.split(" ")[0]} is notified and confirms the commitment before it counts.`
                  : "Choose who should own it."}
              {owner && target
                ? ` ${owner.name} is told about the handover.`
                : ""}
            </p>
          </>
        )}
        <FormError message={assign.error ? errorMessage(assign.error) : ""} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton busy={assign.isPending} disabled={!chosen}>
            {selfOnly
              ? "Take it"
              : target
                ? `Assign to ${target.name.split(" ")[0]}`
                : "Assign"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
