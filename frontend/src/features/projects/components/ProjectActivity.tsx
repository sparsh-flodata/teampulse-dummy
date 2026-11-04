import { Avatar, Empty } from "@/components/ui";
import { ago } from "@/lib/format";
import { useNow } from "@/features/workspace/hooks";
import type { DirectoryPerson } from "@/features/workspace/types";
import type { ProjectDetail } from "../api";

/** Every recorded update on this project's commitments, newest first. */
export function ProjectActivity({
  data,
  directory,
  onWork,
}: {
  data: ProjectDetail;
  directory: DirectoryPerson[];
  onWork: (id: number) => void;
}) {
  const now = useNow();
  const titles = new Map(data.work.map((w) => [w.id, w.title]));
  if (!data.activity.length)
    return (
      <section className="panel">
        <Empty
          title="No updates yet"
          description="Progress, date changes, handovers and dependencies on this project's commitments appear here."
        />
      </section>
    );
  return (
    <section className="panel pj-section">
      <h2>Updates from the project</h2>
      <ul className="pj-feed pj-feed-full">
        {data.activity.map((a) => {
          const actor = directory.find((p) => p.id === a.actor_id);
          return (
            <li key={a.id}>
              <Avatar person={actor} size={28} />
              <div>
                <p>
                  <strong>{actor?.name ?? "Someone"}</strong> {a.message}
                </p>
                <small>
                  {a.work_item_id && titles.get(a.work_item_id) && (
                    <button
                      className="text-button"
                      onClick={() => onWork(a.work_item_id!)}
                    >
                      {titles.get(a.work_item_id)}
                    </button>
                  )}
                  <span>{ago(a.created_at, now)}</span>
                </small>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
