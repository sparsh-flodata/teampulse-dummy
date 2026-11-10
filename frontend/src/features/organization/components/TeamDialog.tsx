import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Check } from "lucide-react";
import { FormError, Modal } from "@/components/ui";
import { bind, errorMessage } from "@/lib/forms";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { Team, WorkspaceState } from "@/features/workspace/types";
import { saveTeam, teamSchema } from "../api";

export function TeamDialog({
  state,
  team,
  onClose,
}: {
  state: WorkspaceState;
  team: Team | "new";
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const save = useWorkspaceMutation(saveTeam, "Department saved.");
  const existing = team === "new" ? null : team;
  const form = useForm({
    defaultValues: {
      name: existing?.name ?? "",
      parent_id: String(existing?.parent_id ?? ""),
      lead_id: String(existing?.lead_id ?? ""),
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await save.mutateAsync({
          id: existing?.id,
          ...teamSchema.parse(value),
        });
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <Modal
      title={existing ? "Edit " + existing.name : "Create a department"}
      subtitle="Departments group members; individual reporting lines are managed separately."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <label>
          Department name
          <form.Field name="name">
            {(f) => (
              <input {...bind(f)} minLength={2} maxLength={120} required />
            )}
          </form.Field>
        </label>
        <label>
          Parent department
          <form.Field name="parent_id">
            {(f) => (
              <select {...bind(f)}>
                <option value="">Top-level department</option>
                {state.teams
                  .filter((t) => !existing || t.id !== existing.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
          </form.Field>
        </label>
        <label>
          Department lead
          <form.Field name="lead_id">
            {(f) => (
              <select {...bind(f)}>
                <option value="">Not assigned</option>
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
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            <Check size={14} />
            Save department
          </button>
        </div>
      </form>
    </Modal>
  );
}
