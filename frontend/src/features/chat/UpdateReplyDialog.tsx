import { useState } from "react";
import type { FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { api, State, UpdateRequest } from "../../lib";
import { Modal } from "../../components/ui";
export function UpdateReplyDialog({
  request,
  state,
  onClose,
  onDone,
}: {
  request: UpdateRequest;
  state: State;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [work, setWork] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/update-requests/" + request.id + "/reply", {
        message: String(f.get("message")),
        work_item_id: work ? Number(work) : null,
        progress: f.get("progress") ? Number(f.get("progress")) : null,
        remaining_hours: f.get("remaining_hours")
          ? Number(f.get("remaining_hours"))
          : null,
        status: f.get("status") || null,
      });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={"Update " + request.requester_name.split(" ")[0]}
      subtitle="Your reply goes to the requester. Selecting work also saves the update to your dashboard."
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <p className="form-note">{request.prompt}</p>
        <label>
          Related commitment
          <select value={work} onChange={(e) => setWork(e.target.value)}>
            <option value="">General update · no work change</option>
            {state.work
              .filter(
                (w) => w.owner_id === state.user.id && w.status !== "Completed",
              )
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Your update
          <textarea
            autoFocus
            name="message"
            minLength={3}
            maxLength={4000}
            placeholder="What moved forward, what remains, and is anything blocked?"
            required
          />
        </label>
        {work && (
          <>
            <div className="form-grid">
              <label>
                Progress (%) · optional
                <input name="progress" type="number" min={0} max={100} />
              </label>
              <label>
                Hours remaining · optional
                <input
                  name="remaining_hours"
                  type="number"
                  min={0}
                  max={1000}
                  step={0.5}
                />
              </label>
            </div>
            <label>
              Status
              <select name="status">
                <option value="">Keep the current status</option>
                <option>In Progress</option>
                <option>Awaiting Verification</option>
                <option>Completed</option>
              </select>
            </label>
            <p className="form-note">
              Explicit percentages and remaining hours in your message are also
              recognized. Completion requires the status selection above.
            </p>
          </>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            Send update{work ? " & save work" : ""}
          </button>
        </div>
      </form>
    </Modal>
  );
}
