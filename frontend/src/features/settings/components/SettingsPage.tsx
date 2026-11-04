import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Settings, Sparkles, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { GoogleChatPanel } from "./GoogleChatPanel";
import { bind, errorMessage } from "@/lib/forms";
import { useWorkspace, useWorkspaceMutation } from "@/features/workspace/hooks";
import {
  PLANNING_OPTIONS,
  availabilitySchema,
  updateAvailability,
} from "../api";

export function SettingsPage() {
  const state = useWorkspace();
  const p = state.user;
  const [error, setError] = useState("");
  const save = useWorkspaceMutation(
    updateAvailability,
    "Availability and planning preferences saved.",
  );
  const form = useForm({
    defaultValues: {
      planning: p.planning,
      weekly_hours: String(p.weekly_hours),
      reserved_hours: String(p.reserved_hours),
      capacity_confirmed: p.capacity.confirmed,
      agent_auto_updates: p.agent_auto_updates,
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await save.mutateAsync(availabilitySchema.parse(value));
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
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
        <form
          className="form settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <label>
            Planning frequency
            <form.Field name="planning">
              {(f) => (
                <select {...bind(f)}>
                  {PLANNING_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              )}
            </form.Field>
            <small>
              Hybrid combines weekly commitments with exception-based daily
              follow-ups.
            </small>
          </label>
          <div className="form-grid">
            <label>
              Working time (next five workdays)
              <form.Field name="weekly_hours">
                {(f) => (
                  <input
                    {...bind(f)}
                    type="number"
                    min={0}
                    max={80}
                    step={0.5}
                    required
                  />
                )}
              </form.Field>
            </label>
            <label>
              Reserved time (hours)
              <form.Field name="reserved_hours">
                {(f) => (
                  <input
                    {...bind(f)}
                    type="number"
                    min={0}
                    max={80}
                    step={0.5}
                    required
                  />
                )}
              </form.Field>
            </label>
          </div>
          <p className="form-note">
            Reserve time for meetings, operations, leave, or other
            responsibilities. This time is excluded from available capacity.
          </p>
          <label className="checkbox">
            <form.Field name="capacity_confirmed">
              {(f) => (
                <input
                  name="confirmed"
                  type="checkbox"
                  checked={f.state.value}
                  onChange={(e) => f.handleChange(e.target.checked)}
                />
              )}
            </form.Field>
            <span>
              I confirm that these hours reflect my availability for the next
              five workdays.
            </span>
          </label>
          <label className="checkbox">
            <form.Field name="agent_auto_updates">
              {(f) => (
                <input
                  name="agent_auto_updates"
                  type="checkbox"
                  checked={f.state.value}
                  onChange={(e) => f.handleChange(e.target.checked)}
                />
              )}
            </form.Field>
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
            <SubmitButton busy={save.isPending}>Save preferences</SubmitButton>
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
        <GoogleChatPanel />
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
