import { useState, FormEvent } from "react";
import { Settings, Sparkles, Check, ShieldCheck, Loader2 } from "lucide-react";
import { api, State } from "../../lib";

export function SettingsView({
  state,
  onDone,
}: {
  state: State;
  onDone: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const p = state.user;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api(
        "/me/availability",
        {
          weekly_hours: Number(f.get("weekly_hours")),
          reserved_hours: Number(f.get("reserved_hours")),
          planning: f.get("planning"),
          capacity_confirmed: f.get("confirmed") === "on",
          agent_auto_updates: f.get("agent_auto_updates") === "on",
        },
        "PATCH",
      );
      await onDone("Availability and planning preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your planning rhythm</h2>
            <p>Enough context to coordinate. Enough space to focus.</p>
          </div>
          <Settings size={20} />
        </div>
        <form className="form settings-form" onSubmit={submit}>
          <label>
            Planning frequency
            <select name="planning" defaultValue={p.planning}>
              <option>Hybrid</option>
              <option>Daily</option>
              <option>Weekly</option>
              <option>On-demand</option>
            </select>
            <small>
              Hybrid combines weekly commitments with exception-based daily
              follow-ups.
            </small>
          </label>
          <div className="form-grid">
            <label>
              Working time (next five workdays)
              <input
                name="weekly_hours"
                type="number"
                min={0}
                max={80}
                step={0.5}
                defaultValue={p.weekly_hours}
                required
              />
            </label>
            <label>
              Reserved time (hours)
              <input
                name="reserved_hours"
                type="number"
                min={0}
                max={80}
                step={0.5}
                defaultValue={p.reserved_hours}
                required
              />
            </label>
          </div>
          <p className="form-note">
            Reserve time for meetings, operations, leave, or other
            responsibilities. This time is excluded from available capacity.
          </p>
          <label className="checkbox">
            <input
              name="confirmed"
              type="checkbox"
              defaultChecked={p.capacity.confirmed}
            />
            <span>
              I confirm that these hours reflect my availability for the next
              five workdays.
            </span>
          </label>
          <label className="checkbox">
            <input
              name="agent_auto_updates"
              type="checkbox"
              defaultChecked={p.agent_auto_updates}
            />
            <span>
              Automatically save explicit progress percentages and remaining
              hours for selected work. Completion, new commitments, and
              delivery-date changes still require confirmation.
            </span>
          </label>
          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <span className="muted">
              Availability confirmation expires after seven days.
            </span>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              Save preferences
            </button>
          </div>
        </form>
      </section>
      <div>
        <section className="panel settings-trust">
          <ShieldCheck size={25} />
          <h3>Trust is part of the workflow.</h3>
          <p>
            TeamPulse records work, commitments, and the context you share. It
            does not track keystrokes, screen time, or employee activity.
          </p>
          <ul>
            <li>Your assistant conversations are private.</li>
            <li>Shared work follows team permissions.</li>
            <li>
              Significant AI changes require confirmation. Routine updates
              follow your preference.
            </li>
            <li>Delivery dates retain their revision history.</li>
          </ul>
        </section>
        <section className="panel assistant-status">
          <Sparkles size={20} />
          <div>
            <h3>
              {state.assistant_connected
                ? "AI provider connected"
                : "Offline planning is active"}
            </h3>
            <p>
              {state.assistant_connected
                ? "Your configured provider interprets planning conversations."
                : "Core work tools and structured offline planning work without an API key. Configure AI_BASE_URL, AI_MODEL, and AI_API_KEY on the server to connect a model."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
