import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DoorClosed, DoorOpen } from "lucide-react";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/forms";
import { EASE } from "@/lib/motion";
import { showToast } from "@/lib/ui-store";
import { openDependency } from "@/features/workspace/domain";
import { useWorkspace, useWorkspaceMutation } from "@/features/workspace/hooks";

type KnockResult = { knocked: string[]; already: string[] };
type Phase = "idle" | "knocking" | "opened";

const OPEN_FOR_MS = 1600;

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
 * The knock itself: two quick raps on the door (a short shake from the hinge
 * side), repeated while the request is in flight, with two sound rings
 * spreading out after each pair. When it lands, the door swings open for a
 * moment. Only transform and opacity animate.
 */
const RAP_SECONDS = 1.1;
const door = {
  idle: { rotate: 0, scale: 1, x: 0 },
  knocking: {
    // knock, knock, then a short pause: the rhythm people recognise
    rotate: [0, -14, 6, -12, 4, 0, 0],
    x: [0, -1.5, 0.5, -1.5, 0.5, 0, 0],
    transition: {
      duration: RAP_SECONDS,
      times: [0, 0.08, 0.16, 0.26, 0.34, 0.42, 1],
      ease: "easeOut" as const,
      repeat: Infinity,
    },
  },
  opened: {
    rotate: 0,
    x: 0,
    scale: [1, 1.3, 1],
    transition: { duration: 0.5, ease: EASE },
  },
};
const ring = (delay: number) => ({
  initial: { scale: 0.55, opacity: 0 },
  animate: {
    scale: [0.55, 1.9],
    opacity: [0.55, 0],
    transition: {
      duration: 0.8,
      delay,
      ease: "easeOut" as const,
      repeat: Infinity,
      repeatDelay: RAP_SECONDS - 0.8,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
});

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
  const stillMotion = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const knock = useWorkspaceMutation<void, KnockResult>(
    () => api.post<KnockResult>(`/work/${work.id}/knock`),
    knockMessage,
  );

  // After a successful knock the door stays open for a moment, then closes again.
  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => setOpened(false), OPEN_FOR_MS);
    return () => clearTimeout(t);
  }, [opened]);

  const waitsOnSomeone = state.dependencies.some(
    (d) => d.work_item_id === work.id && openDependency(d) && d.owner_id !== me,
  );
  const someoneElse =
    (work.owner_id !== null && work.owner_id !== me) || waitsOnSomeone;
  if (work.status === "Completed" || !someoneElse) return null;

  const phase: Phase = knock.isPending
    ? "knocking"
    : opened
      ? "opened"
      : "idle";
  const size = label ? 15 : 16;

  return (
    <button
      type="button"
      className={"knock-button" + (label ? " button small" : " icon-button")}
      data-phase={phase}
      aria-label={"Knock: ask for a status update on " + work.title}
      title="Knock: ask the people on this for a status update"
      disabled={knock.isPending}
      onClick={() =>
        knock.mutate(undefined, {
          onSuccess: () => setOpened(true),
          onError: (error) => showToast(errorMessage(error)),
        })
      }
    >
      <span className="knock-stage" aria-hidden="true">
        <AnimatePresence>
          {phase === "knocking" && !stillMotion && (
            <>
              <motion.i key="ring-1" className="knock-ring" {...ring(0.08)} />
              <motion.i key="ring-2" className="knock-ring" {...ring(0.26)} />
            </>
          )}
          {phase === "opened" && !stillMotion && (
            <motion.i
              key="ring-open"
              className="knock-ring is-open"
              initial={{ scale: 0.6, opacity: 0.7 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        <motion.span
          className="knock-door"
          variants={door}
          animate={stillMotion ? "idle" : phase}
          initial={false}
        >
          {phase === "opened" ? (
            <DoorOpen size={size} />
          ) : (
            <DoorClosed size={size} />
          )}
        </motion.span>
      </span>
      {label && (
        <span>
          {phase === "knocking"
            ? "Knocking…"
            : phase === "opened"
              ? "Knocked"
              : "Knock"}
        </span>
      )}
    </button>
  );
}
