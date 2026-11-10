import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  File,
  FileImage,
  FileText,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { useNow } from "@/features/workspace/hooks";
import type { Attachment } from "../types";

type Shape = "image" | "pdf" | "document" | "link";

const ICONS: Record<Shape, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  document: File,
  link: Link2,
};
const SHAPE_LABELS: Record<Shape, string> = {
  image: "Image",
  pdf: "PDF",
  document: "Document",
  link: "Link",
};

const CANNOT_OPEN =
  "TeamPulse can't open this file right now. Ask the sender to share it again.";

function shapeOf(a: Attachment): Shape {
  if (a.kind === "link") return "link";
  const type = (a.content_type || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(a.name)) return "pdf";
  return "document";
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Yesterday", "Mon 3 Nov" (the year only when it isn't this year). */
export function dayHeading(iso: string, now: number) {
  const date = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    })
    .replace(",", "");
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Newest first, split into consecutive days. */
function groupByDay(items: Attachment[], now: number) {
  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
      b.id - a.id,
  );
  const groups: { heading: string; items: Attachment[] }[] = [];
  for (const item of sorted) {
    const heading = dayHeading(item.created_at, now);
    const last = groups.at(-1);
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  return groups;
}

/** The small square on the left: a thumbnail for inline images, otherwise an icon. */
function Preview({ attachment }: { attachment: Attachment }) {
  const shape = shapeOf(attachment);
  const [failed, setFailed] = useState(false);
  const Icon = ICONS[shape];
  return (
    <span className={"att-preview att-" + shape} aria-hidden="true">
      {attachment.thumbnail_url && !failed ? (
        <img
          src={attachment.thumbnail_url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={18} />
      )}
    </span>
  );
}

function OpenButton({ attachment }: { attachment: Attachment }) {
  if (attachment.can_open && attachment.open_url)
    return (
      <a
        className="button small att-open"
        href={attachment.open_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={"Open " + attachment.name}
      >
        Open
        <ArrowUpRight size={13} />
      </a>
    );
  return (
    <span className="att-open-wrap" title={CANNOT_OPEN}>
      <button
        className="button small att-open"
        disabled
        aria-label={"Open " + attachment.name + ". " + CANNOT_OPEN}
      >
        Open
        <ArrowUpRight size={13} />
      </button>
    </span>
  );
}

function AttachmentRow({
  attachment: a,
  onWork,
  showWork,
  showProject,
  showDate,
}: {
  attachment: Attachment;
  onWork?: (id: number) => void;
  showWork: boolean;
  showProject: boolean;
  showDate: boolean;
}) {
  const shape = shapeOf(a);
  return (
    <li className="att-row">
      <Preview attachment={a} />
      <div className="att-main">
        <strong className="att-name" title={a.name}>
          <span className="att-sr">{SHAPE_LABELS[shape]}: </span>
          {a.name}
        </strong>
        {a.note && <p className="att-note">{a.note}</p>}
        <div className="att-meta">
          <span className="att-sender">
            <Avatar
              person={{ name: a.employee_name, color: a.employee_color }}
              size={18}
            />
            {a.employee_name}
          </span>
          {showWork &&
            a.work_title &&
            (onWork ? (
              <button
                className="att-work"
                title="Open the commitment"
                onClick={() => onWork(a.work_item_id)}
              >
                {a.work_title}
              </button>
            ) : (
              <span className="att-work">{a.work_title}</span>
            ))}
          {showProject && a.project_name && (
            <span
              className="att-project"
              style={{ "--project-color": a.project_color } as CSSProperties}
            >
              <span
                className="project-dot"
                style={{ background: a.project_color }}
              />
              {a.project_name}
            </span>
          )}
        </div>
      </div>
      <time className="att-time" dateTime={a.created_at}>
        {showDate ? dateTimeLabel(a.created_at) : timeLabel(a.created_at)}
      </time>
      <OpenButton attachment={a} />
    </li>
  );
}

/**
 * The one list of files and links, shared by the commitment tab, the project
 * tab, the /files page and the Update center. Rows are grouped by day, newest first.
 * `compact` drops the day headings (each row then shows its date) for tight spaces.
 */
export function AttachmentList({
  items,
  onWork,
  showWork = true,
  showProject = true,
  compact = false,
}: {
  items: Attachment[];
  /** Opens a commitment; when omitted the title is plain text. */
  onWork?: (id: number) => void;
  showWork?: boolean;
  showProject?: boolean;
  compact?: boolean;
}) {
  const now = useNow();
  const row = (a: Attachment) => (
    <AttachmentRow
      key={a.id}
      attachment={a}
      onWork={onWork}
      showWork={showWork}
      showProject={showProject}
      showDate={compact}
    />
  );
  if (compact)
    return <ul className="att-list att-compact">{items.map(row)}</ul>;
  return (
    <div className="att-groups">
      {groupByDay(items, now).map((g) => (
        <section className="att-group" key={g.heading}>
          <h3 className="att-day">{g.heading}</h3>
          <ul className="att-list">{g.items.map(row)}</ul>
        </section>
      ))}
    </div>
  );
}
