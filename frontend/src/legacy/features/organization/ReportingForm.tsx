import { useState, FormEvent } from "react";
import { Check, ShieldCheck, Loader2 } from "lucide-react";
import { Modal } from "../../components/ui";
import { api, State, DirectoryPerson } from "../../lib";

export function ReportingForm({
  state,
  person,
  onClose,
  onDone,
}: {
  state: State;
  person: DirectoryPerson;
  onClose: () => void;
  onDone: (s: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        "/employees/" + person.id,
        {
          name: String(f.get("name")),
          title: String(f.get("title")),
          team_id: Number(f.get("team_id")),
          manager_id: f.get("manager_id") ? Number(f.get("manager_id")) : null,
          role: String(f.get("role")),
          active: f.get("active") === "on",
        },
        "PATCH",
      );
      await onDone(
        "Reporting structure saved. Profile access now follows the updated hierarchy.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={"Edit " + person.name}
      subtitle="Reporting relationships control who can open a full work profile."
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Name
            <input
              name="name"
              defaultValue={person.name}
              required
              minLength={2}
            />
          </label>
          <label>
            Job title
            <input
              name="title"
              defaultValue={person.title}
              required
              minLength={2}
            />
          </label>
          <label>
            Department
            <select name="team_id" defaultValue={person.team_id}>
              {state.teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reports to
            <select name="manager_id" defaultValue={person.manager_id ?? ""}>
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
          </label>
          <label>
            Workspace role
            <select name="role" defaultValue={person.role}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Management / administrator</option>
            </select>
          </label>
        </div>
        <label className="checkbox">
          <input name="active" type="checkbox" defaultChecked={person.active} />
          Account is active
        </label>
        <p className="form-note">
          <ShieldCheck size={15} />
          Employees see shared project work. Managers can open their reporting
          team's full profiles. Administrators have organization-wide access.
          Existing commitments are preserved when someone changes teams.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            Save reporting
          </button>
        </div>
      </form>
    </Modal>
  );
}
