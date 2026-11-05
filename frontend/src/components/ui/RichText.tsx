import { Fragment, type ReactNode } from "react";

/**
 * Renders the assistant's markdown subset as React elements: paragraphs, bullets, numbered
 * items, **bold**, _italic_, `code`, and https links. Text is never parsed as HTML, and
 * anything outside the subset shows as plain text.
 */

// Odd entries of text.split(INLINE) are the matched markup; even entries are plain text.
const INLINE =
  /(\*\*[^\n]+?\*\*|(?<!\w)_[^_\n]+?_(?!\w)|`[^`\n]+`|\[[^\]\n]{1,200}\]\(https:\/\/[^\s)]+\))/;
const LINK = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (i % 2 === 0) return <Fragment key={key}>{part}</Fragment>;
    if (part.startsWith("**"))
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = LINK.exec(part);
    return link ? (
      <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
        {link[1]}
      </a>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    );
  });
}

type Block = { kind: "p" | "ul" | "ol" | "gap"; lines: string[] };

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: "gap", lines: [] });
      continue;
    }
    const bullet = /^- (.*)$/.exec(line);
    const numbered = /^\d+\. (.*)$/.exec(line);
    const kind: Block["kind"] = bullet ? "ul" : numbered ? "ol" : "p";
    const content = bullet?.[1] ?? numbered?.[1] ?? line;
    const last = blocks.at(-1);
    if (last && last.kind === kind) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return blocks.filter((b) => b.kind !== "gap");
}

export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={"rich-text" + (className ? " " + className : "")}>
      {blocksOf(text).map((block, b) => {
        const keyBase = String(b);
        if (block.kind === "ul")
          return (
            <ul key={keyBase}>
              {block.lines.map((l, i) => (
                <li key={i}>{inline(l, `${keyBase}-${i}`)}</li>
              ))}
            </ul>
          );
        if (block.kind === "ol")
          return (
            <ol key={keyBase}>
              {block.lines.map((l, i) => (
                <li key={i}>{inline(l, `${keyBase}-${i}`)}</li>
              ))}
            </ol>
          );
        return (
          <p key={keyBase}>
            {block.lines.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(l, `${keyBase}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
