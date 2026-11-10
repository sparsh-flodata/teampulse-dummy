import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { bind, errorMessage } from "@/lib/forms";
import { CreateFormFrame } from "@/features/workspace/components/CreateDialog";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { WorkspaceState } from "@/features/workspace/types";
import { PROJECT_COLORS, createProject, createProjectSchema } from "../api";

export function CreateProjectForm({
  state,
  onClose,
}: {
  state: WorkspaceState;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const create = useWorkspaceMutation(createProject, "Workspace updated.");
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      team_id: String(state.teams[0]?.id ?? ""),
      color: PROJECT_COLORS[0].value as string,
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await create.mutateAsync(createProjectSchema.parse(value));
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
      <label>
        Project name
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
        Purpose
        <form.Field name="description">
          {(f) => (
            <textarea
              {...bind(f)}
              maxLength={2000}
              placeholder="What will this project make possible?"
            />
          )}
        </form.Field>
      </label>
      <div className="form-grid">
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
          Project color
          <form.Field name="color">
            {(f) => (
              <select {...bind(f)}>
                {PROJECT_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
      </div>
    </CreateFormFrame>
  );
}
