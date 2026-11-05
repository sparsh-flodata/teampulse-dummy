import { isProjectParticipant } from "@/features/workspace/domain";
import { useWorkspace } from "@/features/workspace/hooks";
import {
  useWorkspaceNavigation,
  useWorkspaceSearch,
} from "@/features/workspace/navigation";
import type { AttachmentKindFilter } from "../types";
import { AttachmentFeed } from "./AttachmentFeed";

export type FilesFilters = {
  team?: number;
  project?: number;
  person?: number;
  kind?: AttachmentKindFilter;
};

const KINDS: { value: AttachmentKindFilter | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "files", label: "Files" },
  { value: "links", label: "Links" },
];

const numberOrUndefined = (value: string) =>
  value ? Number(value) : undefined;

/** Every file and link the viewer can see, filtered from the URL. */
export function FilesPage({
  person,
  kind,
  onFilters,
}: {
  person?: number;
  kind?: AttachmentKindFilter;
  onFilters: (patch: FilesFilters) => void;
}) {
  const state = useWorkspace();
  const nav = useWorkspaceNavigation();
  const { team, project, q = "" } = useWorkspaceSearch();
  const selectedProject = state.projects.find((p) => p.id === project);
  const people = state.directory
    .filter((p) =>
      selectedProject
        ? isProjectParticipant(p, selectedProject)
        : team
          ? p.team_id === team
          : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="panel att-panel">
      <div className="panel-heading">
        <div>
          <h2>Files & links</h2>
          <p>
            Screenshots, documents and links people sent with their updates,
            newest first.
          </p>
        </div>
      </div>
      <div className="table-filters att-filters">
        <div className="segmented" role="group" aria-label="Filter type">
          {KINDS.map((k) => (
            <button
              key={k.label}
              className={kind === k.value ? "active" : ""}
              aria-pressed={kind === k.value}
              onClick={() => onFilters({ kind: k.value })}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="filter-selects">
          <select
            aria-label="Filter team"
            value={team ?? ""}
            onChange={(e) =>
              onFilters({
                team: numberOrUndefined(e.target.value),
                person: undefined,
              })
            }
          >
            <option value="">All teams</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter project"
            value={project ?? ""}
            onChange={(e) =>
              onFilters({
                project: numberOrUndefined(e.target.value),
                person: undefined,
              })
            }
          >
            <option value="">All projects</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter person"
            value={person ?? ""}
            onChange={(e) =>
              onFilters({ person: numberOrUndefined(e.target.value) })
            }
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="att-body">
        <AttachmentFeed
          filters={{
            team_id: team,
            project_id: project,
            person_id: person,
            kind,
          }}
          search={q}
          onWork={(id) => void nav.openWork(id)}
        />
      </div>
    </section>
  );
}
