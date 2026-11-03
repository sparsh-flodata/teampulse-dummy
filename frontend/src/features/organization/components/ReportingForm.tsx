import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { ShieldCheck } from "lucide-react";
import { FormError, Modal, SubmitButton } from "@/components/ui";
import { bind, errorMessage } from "@/lib/forms";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type {
  DirectoryPerson,
  WorkspaceState,
} from "@/features/workspace/types";
import { updateEmployee, updateEmployeeSchema } from "../api";

export function ReportingForm({
  state,
  person,
  onClose,
}: {
  state: WorkspaceState;
  person: DirectoryPerson;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const save = useWorkspaceMutation(
    updateEmployee,
    "Reporting structure saved. Profile access now follows the updated hierarchy.",
  );
  const form = useForm({
    defaultValues: {
      name: person.name,
      title: person.title,
      team_id: String(person.team_id),
      manager_id: String(person.manager_id ?? ""),
      role: person.role,
      active: person.active,
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await save.mutateAsync({
          id: person.id,
          ...updateEmployeeSchema.parse(value),
        });
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <Modal
      title={"Edit " + person.name}
      subtitle="Reporting relationships control who can open a full work profile."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="form-grid">
          <label>
            Name
            <form.Field name="name">
              {(f) => <input {...bind(f)} required minLength={2} />}
            </form.Field>
          </label>
          <label>
            Job title
            <form.Field name="title">
              {(f) => <input {...bind(f)} required minLength={2} />}
            </form.Field>
          </label>
          <label>
            Department
            <form.Field name="team_id">
              {(f) => (
                <select {...bind(f)}>
                  {state.teams.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </form.Field>
          </label>
          <label>
            Reports to
            <form.Field name="manager_id">
              {(f) => (
                <select {...bind(f)}>
                  <option value="">No reporting manager</option>
                  {state.directory
                    .filter(
                      (p) =>
                        p.active &&
                        p.id !== person.id &&
                        ["manager", "admin"].includes(p.role),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              )}
            </form.Field>
          </label>
          <label>
            Workspace role
            <form.Field name="role">
              {(f) => (
                <select {...bind(f)}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Management / administrator</option>
                </select>
              )}
            </form.Field>
          </label>
        </div>
        <label className="checkbox">
          <form.Field name="active">
            {(f) => (
              <input
                name="active"
                type="checkbox"
                checked={f.state.value}
                onChange={(e) => f.handleChange(e.target.checked)}
              />
            )}
          </form.Field>
          Account is active
        </label>
        <p className="form-note">
          <ShieldCheck size={15} />
          Employees see shared project work. Managers can open their reporting
          team's full profiles. Administrators have organization-wide access.
          Existing commitments are preserved when someone changes teams.
        </p>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton busy={save.isPending}>Save reporting</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
