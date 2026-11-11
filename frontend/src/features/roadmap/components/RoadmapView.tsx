import { motion } from "motion/react";
import { CalendarDays, Flag, Target } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { EASE } from "@/lib/motion";
import type { BadgeTone } from "@/components/ui/Badge";
import type { Milestone, Roadmap } from "../api";

const STATUS: Record<Milestone["status"], { label: string; tone: BadgeTone }> =
  {
    done: { label: "Done", tone: "green" },
    in_progress: { label: "In progress", tone: "purple" },
    planned: { label: "Planned", tone: "neutral" },
  };

const PHASE_LABEL = {
  current: "This quarter",
  next: "Next quarter",
  later: "After that",
} as const;

/** A progress bar that fills on arrival. Only transform animates. */
export function RoadmapBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  return (
    <span
      className="rm-bar"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.i
        initial={{ scaleX: 0 }}
        animate={{ scaleX: percent / 100 }}
        transition={{ duration: 0.7, ease: EASE }}
      />
    </span>
  );
}

export const band = (percent: number) =>
  percent >= 60 ? "tone-done" : percent >= 30 ? "tone-wait" : "tone-early";

/** One person's roadmap: where they are, then this quarter and the next two. */
export function RoadmapView({ roadmap }: { roadmap: Roadmap }) {
  const { person } = roadmap;
  return (
    <div className="rm-view">
      <section className={"panel rm-summary " + band(roadmap.percent)}>
        <div className="rm-who">
          <Avatar person={person} size={44} />
          <div>
            <strong>{person.name}</strong>
            <small>
              {person.title} · {roadmap.track}
            </small>
            <Badge value="Sample roadmap" tone="neutral" plain />
          </div>
        </div>
        <div className="rm-score">
          <strong>{roadmap.percent}%</strong>
          <small>of the roadmap achieved</small>
          <RoadmapBar
            percent={roadmap.percent}
            label={`${person.name}'s roadmap: ${roadmap.percent}% achieved`}
          />
        </div>
        <dl className="rm-facts">
          <div>
            <dt>
              <Target size={14} aria-hidden="true" />
              Milestones done
            </dt>
            <dd>
              {roadmap.done} of {roadmap.total}
            </dd>
          </div>
          <div>
            <dt>
              <Flag size={14} aria-hidden="true" />
              In progress
            </dt>
            <dd>{roadmap.in_progress}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={14} aria-hidden="true" />
              Up next
            </dt>
            <dd>{roadmap.next_milestone ?? "Everything is done"}</dd>
          </div>
        </dl>
      </section>
      <div className="rm-phases">
        {roadmap.phases.map((phase) => (
          <section
            key={phase.name}
            className={"panel rm-phase is-" + phase.when}
          >
            <header>
              <h2>{phase.name}</h2>
              <span>{PHASE_LABEL[phase.when]}</span>
            </header>
            <ol>
              {phase.milestones.map((m) => (
                <li key={m.id} className={"rm-milestone is-" + m.status}>
                  <div className="rm-milestone-top">
                    <Badge
                      value={STATUS[m.status].label}
                      tone={STATUS[m.status].tone}
                    />
                    <span className="rm-kind">{m.kind}</span>
                  </div>
                  <strong>{m.title}</strong>
                  <div className="rm-milestone-foot">
                    <span>{m.due}</span>
                    {m.status === "in_progress" && (
                      <>
                        <RoadmapBar
                          percent={m.progress}
                          label={`${m.title}: ${m.progress}%`}
                        />
                        <span>{m.progress}%</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
