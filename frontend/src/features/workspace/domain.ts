import type {
  Dependency,
  DirectoryPerson,
  HealthSummary,
  Person,
  Project,
  Tone,
  Work,
} from "./types";

export const openDependency = (d: Dependency) =>
  !["Verified", "Cancelled"].includes(d.status);

/** UX-only role check. The backend enforces every permission. */
export const isManager = (p: Pick<Person, "role">) =>
  ["manager", "admin"].includes(p.role);

export function summarizeHealth(works: Work[]): HealthSummary {
  const active = works.filter((w) => w.status !== "Completed");
  const counts = { green: 0, amber: 0, red: 0, neutral: 0 };
  active.forEach((w) => counts[w.tone]++);
  const tone: Tone = counts.red
    ? "red"
    : counts.amber
      ? "amber"
      : counts.neutral || !works.length
        ? "neutral"
        : "green";
  return {
    tone,
    label: {
      green: "On track",
      amber: "Needs review",
      red: "Action needed",
      neutral: "Confirmation needed",
    }[tone],
    counts,
    active: active.length,
    completed: works.length - active.length,
  };
}

export function isProjectParticipant(
  person: Pick<DirectoryPerson, "id" | "team_id" | "active">,
  project?: Project,
) {
  return (
    !!project &&
    person.active &&
    (person.team_id === project.team_id ||
      project.member_ids.includes(person.id))
  );
}
