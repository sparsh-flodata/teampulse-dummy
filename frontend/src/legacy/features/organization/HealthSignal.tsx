import { Clock3, Flag, CheckCircle2 } from "lucide-react";
import { HealthSummary } from "../../lib";

export function HealthSignal({
  health,
  compact = false,
}: {
  health: HealthSummary;
  compact?: boolean;
}) {
  return (
    <div
      className={
        "health-signal tone-" + health.tone + (compact ? " compact" : "")
      }
    >
      <span className="signal-orb">
        {health.tone === "green" ? (
          <CheckCircle2 size={17} />
        ) : health.tone === "red" ? (
          <Flag size={17} />
        ) : (
          <Clock3 size={17} />
        )}
      </span>
      <div>
        <strong>{health.label}</strong>
        {!compact && (
          <p>
            {health.counts.red} need action · {health.counts.amber} need review
            · {health.counts.green} on track · {health.counts.neutral}{" "}
            unconfirmed
          </p>
        )}
      </div>
    </div>
  );
}
