import { DoorClosed } from "lucide-react";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/forms";
import { showToast } from "@/lib/ui-store";
import { openDependency } from "@/features/workspace/domain";
import { useWorkspace, useWorkspaceMutation } from "@/features/workspace/hooks";

type KnockResult = { knocked: string[]; already: string[] };

const firstNames = (names: string[]) =>
  names.map((n) => n.split(" ")[0]).join(", ");

function knockMessage(result: KnockResult) {
  const parts: string[] = [];
  if (result.knocked.length)
    parts.push(
      `Knocked on ${firstNames(result.knocked)}. They'll see it in TeamPulse and on Google Chat.`,
    );
  if (result.already.length)
    parts.push(
      `Still waiting on ${firstNames(result.already)} from your last knock.`,
    );
  return parts.join(" ");
}

/**
 * Knock knock: asks the people working on a commitment (its assignee, and the
 * owners of what it waits on) how it is going, as a Google Chat DM and in their
 * TeamPulse inbox. Their reply updates the work. Hidden when nobody else is
 * involved; the server decides who is knocked.
 */
export function KnockButton({
  work,
  label = false,
}: {
  work: { id: number; title: string; owner_id: number | null; status: string };
  /** Show the word "Knock" next to the icon (detail views). */
  label?: boolean;
}) {
  const state = useWorkspace();
  const me = state.user.id;
  const knock = useWorkspaceMutation<void, KnockResult>(
    () => api.post<KnockResult>(`/work/${work.id}/knock`),
    knockMessage,
  );
  const waitsOnSomeone = state.dependencies.some(
    (d) => d.work_item_id === work.id && openDependency(d) && d.owner_id !== me,
  );
  const someoneElse =
    (work.owner_id !== null && work.owner_id !== me) || waitsOnSomeone;
  if (work.status === "Completed" || !someoneElse) return null;
  return (
    <button
      type="button"
      className={"knock-button" + (label ? " button small" : " icon-button")}
      aria-label={"Knock: ask for a status update on " + work.title}
      title="Knock: ask the people on this for a status update"
      disabled={knock.isPending}
      data-knocking={knock.isPending || undefined}
      onClick={() =>
        knock.mutate(undefined, {
          onError: (error) => showToast(errorMessage(error)),
        })
      }
    >
      <DoorClosed size={label ? 15 : 16} aria-hidden="true" />
      {label && <span>Knock</span>}
    </button>
  );
}
