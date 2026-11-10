import { useState } from "react";
import type { ProjectMember } from "@/features/projects/api";
import { AttachmentFeed } from "./AttachmentFeed";

/** The project page's "Files & links" tab, with a filter by project member. */
export function ProjectFiles({
  projectId,
  members,
  onWork,
}: {
  projectId: number;
  members: ProjectMember[];
  onWork: (id: number) => void;
}) {
  const [person, setPerson] = useState<number | undefined>();
  const people = [...members].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="panel att-panel">
      <div className="panel-heading">
        <div>
          <h2>Files & links</h2>
          <p>What people sent with their updates on this project.</p>
        </div>
        <div className="filter-selects">
          <select
            aria-label="Filter person"
            value={person ?? ""}
            onChange={(e) =>
              setPerson(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Everyone</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="att-body">
        <AttachmentFeed
          filters={{ project_id: projectId, person_id: person }}
          showProject={false}
          onWork={onWork}
        />
      </div>
    </section>
  );
}
