import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { FormError, Modal, SubmitButton } from "@/components/ui";
import { RichText } from "@/components/ui/RichText";
import { bind, errorMessage } from "@/lib/forms";
import { useWorkspaceMutation } from "@/features/workspace/hooks";
import type { UpdateRequest, WorkspaceState } from "@/features/workspace/types";
import { replySchema, replyToUpdateRequest } from "../api";

export function UpdateReplyDialog({
  request,
  state,
  onClose,
}: {
  request: UpdateRequest;
  state: WorkspaceState;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const reply = useWorkspaceMutation(
    replyToUpdateRequest,
    "Your reply was saved and your manager was notified.",
  );
  const form = useForm({
    defaultValues: {
      work_item_id: "",
      message: "",
      progress: "",
      remaining_hours: "",
      status: "",
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        // Work fields only apply when a commitment is selected.
        const input = value.work_item_id
          ? value
          : { ...value, progress: "", remaining_hours: "", status: "" };
        await reply.mutateAsync({
          id: request.id,
          ...replySchema.parse(input),
        });
        onClose();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <Modal
      title={"Update " + request.requester_name.split(" ")[0]}
      subtitle="Your reply goes to the requester. Selecting work also saves the update to your dashboard."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <RichText className="form-note" text={request.prompt} />
        <label>
          Related commitment
          <form.Field name="work_item_id">
            {(f) => (
              <select
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              >
                <option value="">General update · no work change</option>
                {state.work
                  .filter(
                    (w) =>
                      w.owner_id === state.user.id && w.status !== "Completed",
                  )
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
          Your update
          <form.Field name="message">
            {(f) => (
              <textarea
                {...bind(f)}
                autoFocus
                minLength={3}
                maxLength={4000}
                placeholder="What moved forward, what remains, and is anything blocked?"
                required
              />
            )}
          </form.Field>
        </label>
        <form.Subscribe selector={(s) => s.values.work_item_id}>
          {(work) =>
            work && (
              <>
                <div className="form-grid">
                  <label>
                    Progress (%) · optional
                    <form.Field name="progress">
                      {(f) => (
                        <input {...bind(f)} type="number" min={0} max={100} />
                      )}
                    </form.Field>
                  </label>
                  <label>
                    Hours remaining · optional
                    <form.Field name="remaining_hours">
                      {(f) => (
                        <input
                          {...bind(f)}
                          type="number"
                          min={0}
                          max={1000}
                          step={0.5}
                        />
                      )}
                    </form.Field>
                  </label>
                </div>
                <label>
                  Status
                  <form.Field name="status">
                    {(f) => (
                      <select {...bind(f)}>
                        <option value="">Keep the current status</option>
                        <option>In Progress</option>
                        <option>Awaiting Verification</option>
                        <option>Completed</option>
                      </select>
                    )}
                  </form.Field>
                </label>
                <p className="form-note">
                  Explicit percentages and remaining hours in your message are
                  also recognized. Completion requires the status selection
                  above.
                </p>
              </>
            )
          }
        </form.Subscribe>
        <FormError message={error} />
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <form.Subscribe selector={(s) => s.values.work_item_id}>
            {(work) => (
              <SubmitButton busy={reply.isPending}>
                Send update{work ? " & save work" : ""}
              </SubmitButton>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Modal>
  );
}
