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
const PURPLE = ["In Progress", "Accepted", "Fully allocated"];

export function Badge({ value }: { value: string }) {
  const tone = GREEN.includes(value)
    ? "green"
    : RED.includes(value)
      ? "red"
      : AMBER.includes(value)
        ? "amber"
        : PURPLE.includes(value)
          ? "purple"
          : "neutral";
  return (
    <span className={"badge " + tone}>
      <i />
      {value}
    </span>
  );
}
