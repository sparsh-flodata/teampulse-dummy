import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Clock3 } from "lucide-react";
import { bind, errorMessage } from "@/lib/forms";
import { CreateFormFrame } from "@/features/workspace/components/CreateDialog";
import { isManager, isProjectParticipant } from "@/features/workspace/domain";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { WorkspaceState } from "@/features/workspace/types";
import { createWork } from "../api";
import { PRIORITIES, createWorkSchema } from "../schemas";

export function CreateWorkForm({
  state,
  onClose,
}: {
  state: WorkspaceState;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const create = useWorkspaceMutation(createWork, "Commitment created.");
  const manager = isManager(state.user);
  const ownersFor = (projectId: string) =>
    state.employees
      .filter((p) =>
        isProjectParticipant(
          p,
          state.projects.find((x) => x.id === Number(projectId)),
        ),
      )
      .filter((p) => manager || p.id === state.user.id);
  const defaultOwner = (projectId: string) =>
    ownersFor(projectId).some((p) => p.id === state.user.id)
      ? String(state.user.id)
      : manager
        ? ""
        : String(ownersFor(projectId)[0]?.id ?? "");
  const firstProject = String(state.projects[0]?.id ?? "");

  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      project_id: firstProject,
      owner_id: defaultOwner(firstProject),
      effort_hours: "4",
      due_date: state.today,
      priority: "Medium",
      required_skills: "",
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await create.mutateAsync(createWorkSchema.parse(value));
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
      submitLabel="Create commitment"
    >
      <label>
        What needs to be delivered?
        <form.Field name="title">
          {(f) => (
            <input
              {...bind(f)}
              placeholder="e.g. Complete the property dashboard API"
              minLength={3}
              maxLength={200}
              required
              autoFocus
            />
          )}
        </form.Field>
      </label>
      <label>
        Scope & context
        <form.Field name="description">
          {(f) => (
            <textarea
              {...bind(f)}
              placeholder="What does done look like?"
              maxLength={4000}
            />
          )}
        </form.Field>
      </label>
      <div className="form-grid">
        <label>
          Project
          <form.Field
            name="project_id"
            listeners={{
              // Changing project resets the owner, as the old form did.
              onChange: ({ value }) =>
                form.setFieldValue("owner_id", defaultOwner(value)),
            }}
          >
            {(f) => (
              <select {...bind(f)}>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Owner
          <form.Subscribe selector={(s) => s.values.project_id}>
            {(projectId) => (
              <form.Field name="owner_id">
                {(f) => (
                  <select {...bind(f)}>
                    {manager && (
                      <option value="">Unassigned · decide later</option>
                    )}
                    {ownersFor(projectId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </form.Field>
            )}
          </form.Subscribe>
        </label>
        <label>
          Estimated effort (hours)
          <form.Field name="effort_hours">
            {(f) => (
              <input
                {...bind(f)}
                type="number"
                min={0.5}
                max={1000}
                step={0.5}
                required
              />
            )}
          </form.Field>
        </label>
        <label>
          Expected completion
          <form.Field name="due_date">
            {(f) => (
              <input {...bind(f)} type="date" min={state.today} required />
            )}
          </form.Field>
        </label>
        <label>
          Priority
          <form.Field name="priority">
            {(f) => (
              <select {...bind(f)}>
                {PRIORITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Relevant skills
          <form.Field name="required_skills">
            {(f) => (
              <input
                {...bind(f)}
                placeholder="React, Python…"
                maxLength={500}
              />
            )}
          </form.Field>
        </label>
      </div>
      <div className="form-note">
        <Clock3 size={16} />
        Effort is working time. The completion date is a separate commitment.
      </div>
    </CreateFormFrame>
  );
}
