import {
  CircleAlert,
  CircleArrowRight,
  CircleCheck,
  Clock,
  TriangleAlert,
} from "lucide-react";

const GREEN = [
  "Completed",
  "Verified",
  "On track",
  "Available",
  "Approved",
  "Applied",
];
const RED = [
  "Blocked",
  "Overdue",
  "Urgent",
  "Critical",
  "Overloaded",
  "At risk",
  "At Risk",
  "Action needed",
  "Dependency at risk",
];
const AMBER = [
  "Partially Blocked",
  "Progress unconfirmed",
  "High",
  "Delivered",
  "Awaiting Verification",
  "Needs review",
  "Review dependency",
  "Awaiting verification",
];
const BLUE = ["In Progress", "Accepted", "Fully allocated"];

export type BadgeTone = "green" | "red" | "amber" | "purple" | "neutral";

export function badgeTone(value: string): BadgeTone {
  return GREEN.includes(value)
    ? "green"
    : RED.includes(value)
      ? "red"
      : AMBER.includes(value)
        ? "amber"
        : BLUE.includes(value)
          ? "purple"
          : "neutral";
}

/* Coral status pill: a soft tint by meaning, an icon and the word.
   "purple" is kept as the class name for the in-hand family (now blue). */
const ICONS = {
  green: CircleCheck,
  red: TriangleAlert,
  amber: CircleAlert,
  purple: CircleArrowRight,
  neutral: Clock,
} as const;

export function Badge({
  value,
  tone,
  plain = false,
}: {
  value: string;
  tone?: BadgeTone;
  /** A label rather than a status: no icon. */
  plain?: boolean;
}) {
  const t = tone ?? badgeTone(value);
  const Icon = ICONS[t];
  return (
    <span className={"badge " + t}>
      {!plain && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
      {value}
    </span>
  );
}

/** Work-health tone (green/amber/red/neutral) to its badge family. */
export function healthTone(tone: string): BadgeTone {
  return tone === "green" || tone === "amber" || tone === "red"
    ? tone
    : "neutral";
}
