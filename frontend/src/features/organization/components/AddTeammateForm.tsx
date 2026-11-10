import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { bind, errorMessage } from "@/lib/forms";
import { CreateFormFrame } from "@/features/workspace/components/CreateDialog";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { WorkspaceState } from "@/features/workspace/types";
import { createEmployee, createEmployeeSchema } from "../api";

export function AddTeammateForm({
  state,
  onClose,
}: {
  state: WorkspaceState;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const create = useWorkspaceMutation(createEmployee, "Workspace updated.");
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      title: "Team member",
      team_id: String(state.teams[0]?.id ?? ""),
      role: "employee",
      password: "",
      manager_id: String(state.user.id),
      skills: "",
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await create.mutateAsync(
          createEmployeeSchema.parse({
            ...value,
            // Only administrators choose the manager; others add their own report.
            manager_id: state.can_manage_org ? value.manager_id : state.user.id,
          }),
        );
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <CreateFormFrame
      onSubmit={() => void form.handleSubmit()}
      onClose={onClose}
      busy={create.isPending}
      error={error}
      submitLabel="Save changes"
    >
      <div className="form-grid">
        <label>
          Full name
          <form.Field name="name">
            {(f) => (
              <input
                {...bind(f)}
                minLength={2}
                maxLength={120}
                required
                autoFocus
              />
            )}
          </form.Field>
        </label>
        <label>
          Work email
          <form.Field name="email">
            {(f) => (
              <input {...bind(f)} type="email" maxLength={254} required />
            )}
          </form.Field>
        </label>
        <label>
          Job title
          <form.Field name="title">
            {(f) => <input {...bind(f)} maxLength={120} required />}
          </form.Field>
        </label>
        <label>
          Team
          <form.Field name="team_id">
            {(f) => (
              <select {...bind(f)}>
                {state.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Role
          <form.Field name="role">
            {(f) => (
              <select {...bind(f)}>
                <option value="employee">Employee</option>
                {state.can_manage_org && (
                  <option value="manager">Manager</option>
                )}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Initial password
          <form.Field name="password">
            {(f) => (
              <input
                {...bind(f)}
                type="password"
                minLength={12}
                maxLength={256}
                required
                autoComplete="new-password"
              />
            )}
          </form.Field>
        </label>
      </div>
      {state.can_manage_org && (
        <label>
          Reports to
          <form.Field name="manager_id">
            {(f) => (
              <select {...bind(f)}>
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
            )}
          </form.Field>
        </label>
      )}
      <label>
        Skills
        <form.Field name="skills">
          {(f) => (
            <input
              {...bind(f)}
              placeholder="Comma-separated skills"
              maxLength={500}
            />
          )}
        </form.Field>
      </label>
      <p className="form-note">
        Share the initial password with your teammate through your usual secure
        channel. No email is sent.
      </p>
    </CreateFormFrame>
  );
}
