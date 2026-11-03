import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Link2 } from "lucide-react";
import { bind, errorMessage } from "@/lib/forms";
import { CreateFormFrame } from "@/features/workspace/components/CreateDialog";
import { isProjectParticipant } from "@/features/workspace/domain";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { Work, WorkspaceState } from "@/features/workspace/types";
import { createDependency } from "../api";
import { createDependencySchema } from "../schemas";

export function CreateDependencyForm({
  state,
  work,
  onClose,
}: {
  state: WorkspaceState;
  work: Work;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const create = useWorkspaceMutation(
    createDependency,
    "Dependency recorded. The owner has an in-app notification.",
  );
  const project = state.projects.find((p) => p.id === work.project_id);
  const owners = state.directory.filter((p) =>
    isProjectParticipant(p, project),
  );
  const form = useForm({
    defaultValues: {
      deliverable: "",
      owner_id: String(owners[0]?.id ?? ""),
      due_date: state.today,
      impact: "High",
      partial: "partial",
      upstream_work_id: "",
      reason: "",
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await create.mutateAsync(
          createDependencySchema.parse({ ...value, work_item_id: work.id }),
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
      submitLabel="Record dependency"
    >
      <div className="form-note">
        <Link2 size={16} />
        {work.title}
      </div>
      <label>
        Required deliverable
        <form.Field name="deliverable">
          {(f) => (
            <input
              {...bind(f)}
              placeholder="e.g. Updated database schema"
              minLength={3}
              maxLength={200}
              required
              autoFocus
            />
          )}
        </form.Field>
      </label>
      <div className="form-grid">
        <label>
          Responsible person
          <form.Field name="owner_id">
            {(f) => (
              <select {...bind(f)} required>
                {owners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Expected delivery
          <form.Field name="due_date">
            {(f) => <input {...bind(f)} type="date" required />}
          </form.Field>
        </label>
        <label>
          Impact
          <form.Field name="impact">
            {(f) => (
              <select {...bind(f)}>
                {["Low", "Medium", "High", "Critical"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Can other work continue?
          <form.Field name="partial">
            {(f) => (
              <select {...bind(f)}>
                <option value="partial">Yes · partially blocked</option>
                <option value="full">No · fully blocked</option>
              </select>
            )}
          </form.Field>
        </label>
      </div>
      <label>
        Related upstream work (optional)
        <form.Field name="upstream_work_id">
          {(f) => (
            <select {...bind(f)}>
              <option value="">A deliverable outside recorded work</option>
              {state.work
                .filter((w) => w.id !== work.id && w.status !== "Completed")
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
            </select>
          )}
        </form.Field>
      </label>
      <label>
        Why is it needed?
        <form.Field name="reason">
          {(f) => (
            <textarea
              {...bind(f)}
              placeholder="Explain the effect on your commitment."
              maxLength={2000}
            />
          )}
        </form.Field>
      </label>
    </CreateFormFrame>
  );
}
