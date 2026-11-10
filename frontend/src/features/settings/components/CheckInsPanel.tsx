import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { Badge, FormError } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { errorMessage } from "@/lib/forms";
import { useWorkspace, useWorkspaceMutation } from "@/features/workspace/hooks";
import { preferencesQuery, updatePreferences } from "../api";

/** Daily check-ins: on or off, and a one-day pause. Each change saves at once. */
export function CheckInsPanel() {
  const today = useWorkspace().today;
  const { data, isPending, isError } = useQuery(preferencesQuery());
  const save = useWorkspaceMutation(updatePreferences, (r, vars) =>
    vars.pause_until_tomorrow === true
      ? "Check-ins paused until tomorrow."
      : vars.pause_until_tomorrow === false
        ? "Check-ins resumed."
        : r.proactive_checkins
          ? "Daily check-ins turned on."
          : "Daily check-ins turned off.",
  );
  // The server stores the day check-ins resume; before it, they are paused.
  const paused = Boolean(
    data?.checkins_paused_until && data.checkins_paused_until > today,
  );
  const on = Boolean(data?.enabled && data.proactive_checkins);
  return (
    <section className="panel checkins-panel">
      <BellRing size={20} />
      <div>
        <div className="split">
          <h3>Check-ins</h3>
          {isPending ? null : isError ? (
            <Badge value="Unavailable" tone="neutral" />
          ) : !data.enabled ? (
            <Badge value="Off for workspace" tone="neutral" />
          ) : !data.proactive_checkins ? (
            <Badge value="Off" tone="neutral" />
          ) : paused ? (
            <Badge value="Paused" tone="amber" />
          ) : (
            <Badge value="On" tone="green" />
          )}
        </div>
        {isPending ? (
          <p>Loading your check-in preferences.</p>
        ) : isError ? (
          <p>Your check-in preferences didn’t load. Try again in a moment.</p>
        ) : (
          <>
            <p>
              On weekdays at {String(data.checkin_hour).padStart(2, "0")}:00 (
              {data.org_timezone}), the assistant asks about overdue, due-soon,
              or stale commitments and dependencies you owe, in AI chat and in
              Google Chat if you connected it.
            </p>
            {!data.enabled && (
              <p className="checkins-note">
                Check-ins are switched off for the workspace. Your choice below
                applies when an administrator turns them on.
              </p>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                name="proactive_checkins"
                checked={data.proactive_checkins}
                disabled={save.isPending}
                onChange={(e) =>
                  save.mutate({ proactive_checkins: e.target.checked })
                }
              />
              <span>Daily check-ins</span>
            </label>
            {data.proactive_checkins &&
              (paused && data.checkins_paused_until ? (
                <div className="checkins-paused">
                  <span>
                    Paused until {dateLabel(data.checkins_paused_until)}
                  </span>
                  <button
                    className="button small"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ pause_until_tomorrow: false })}
                  >
                    Resume
                  </button>
                </div>
              ) : (
                <button
                  className="button small"
                  disabled={save.isPending || !on}
                  onClick={() => save.mutate({ pause_until_tomorrow: true })}
                >
                  Pause until tomorrow
                </button>
              ))}
            <FormError message={save.error ? errorMessage(save.error) : ""} />
          </>
        )}
      </div>
    </section>
  );
}
