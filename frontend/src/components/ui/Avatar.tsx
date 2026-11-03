import type { CSSProperties } from "react";

export function Avatar({
  person,
  size = 32,
}: {
  person?: { name: string; color: string };
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={
        {
          "--avatar-color": person?.color || "var(--color-muted)",
          width: size,
          height: size,
          fontSize: size * 0.32,
        } as CSSProperties
      }
    >
      {person
        ? person.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
        : "?"}
    </span>
  );
}
