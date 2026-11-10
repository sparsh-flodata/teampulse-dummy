import type { Person, Work, WorkspaceState } from "@/features/workspace/types";
import { openDependency, summarizeHealth } from "@/features/workspace/domain";
import type { View, WorkspaceSearch } from "@/features/workspace/navigation";

/**
 * The derived figures behind Overview, My work and All commitments, computed
 * exactly as the original single-page app did.
 */
export function commitmentsModel(
  state: WorkspaceState,
  view: View,
  search: WorkspaceSearch,
) {
  const overviewScope = search.scope ?? "personal",
    drillScope = search.drill ?? "",
    statusFilter = search.status ?? "active",
    query = search.q ?? "";
  const me = state.user;

  const dashboardWork = state.work.filter((w) =>
    overviewScope === "personal"
      ? w.owner_id === me.id
      : overviewScope === "team"
        ? state.report_ids.includes(w.owner_id || 0)
        : true,
  );
  const summary = summarizeHealth(dashboardWork);
  const scopePeople = state.employees.filter(
    (p) =>
      p.active &&
      (overviewScope === "personal"
        ? p.id === me.id
        : overviewScope === "team"
          ? state.report_ids.includes(p.id)
          : true),
  );
  const base = view === "Overview" ? dashboardWork : state.work;
  const active = base.filter((w) => w.status !== "Completed"),
    risk = active.filter((w) => ["red", "amber"].includes(w.tone)),
    blocked = active.filter((w) =>
      ["Blocked", "Partially Blocked"].includes(w.status),
    ),
    deps = state.dependencies
      .filter(openDependency)
      .filter(
        (d) =>
          view !== "Overview" ||
          dashboardWork.some((w) => w.id === d.work_item_id),
      ),
    available = (view === "Overview" ? scopePeople : state.employees).filter(
      (p: Person) => p.capacity.confirmed && (p.capacity.available || 0) >= 2,
    ),
    coverage = scopePeople.filter((p) =>
      active.some((w) => w.owner_id === p.id && w.commitment_confirmed),
    ).length;

  const filtered = state.work.filter((w: Work) => {
    const project = state.projects.find((p) => p.id === w.project_id),
      owner = state.directory.find((p) => p.id === w.owner_id);
    return (
      (view !== "My work" || w.owner_id === me.id) &&
      (view !== "Overview" || dashboardWork.includes(w)) &&
      (!drillScope ||
        drillScope === "organization" ||
        (drillScope === "personal" && w.owner_id === me.id) ||
        (drillScope === "team" &&
          state.report_ids.includes(w.owner_id || 0))) &&
      (!search.project || w.project_id === search.project) &&
      (!search.team || project?.team_id === search.team) &&
      (!query ||
        [w.title, project?.name, owner?.name, w.required_skills]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (statusFilter === "all" ||
        (statusFilter === "active" && w.status !== "Completed") ||
        (statusFilter === "attention" && risk.includes(w)) ||
        (statusFilter === "blocked" && blocked.includes(w)) ||
        w.status === statusFilter)
    );
  });

  return {
    overviewScope,
    statusFilter,
    summary,
    scopePeople,
    dashboardWork,
    active,
    risk,
    blocked,
    deps,
    available,
    coverage,
    filtered,
    displayWorks: view === "Overview" ? filtered.slice(0, 6) : filtered,
  };
}

export type CommitmentsModel = ReturnType<typeof commitmentsModel>;

/** CSV export of the current commitments view (formula-injection safe). */
export function commitmentsCsv(state: WorkspaceState, works: Work[]) {
  const rows = [
    [
      "Commitment",
      "Project",
      "Owner",
      "Status",
      "Health",
      "Expected completion",
      "Remaining effort (hours)",
      "Last confirmed",
    ],
    ...works.map((w) => [
      w.title,
      state.projects.find((p) => p.id === w.project_id)?.name || "",
      state.directory.find((p) => p.id === w.owner_id)?.name || "Unassigned",
      w.status,
      w.health,
      w.due_date,
      String(w.remaining_hours),
      w.confirmed_at || "Unconfirmed",
    ]),
  ];
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            (/^[=+@-]/.test(v) ? "'" : "") +
            v.replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
