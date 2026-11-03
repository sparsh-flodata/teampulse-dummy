import type { ReactNode } from "react";

/** The legacy inline form error block (role="alert"). Renders nothing when empty. */
export function FormError({
  message,
  icon,
  as = "div",
}: {
  message?: string | null;
  icon?: ReactNode;
  as?: "div" | "p";
}) {
  if (!message) return null;
  const Tag = as;
  return (
    <Tag className="error" role="alert">
      {icon}
      {message}
    </Tag>
  );
}
