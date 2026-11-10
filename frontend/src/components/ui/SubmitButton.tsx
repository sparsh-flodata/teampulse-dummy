import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

/** Primary submit button that swaps its icon for a spinner while busy. */
export function SubmitButton({
  busy,
  children,
  iconSize = 15,
  disabled,
}: {
  busy: boolean;
  children: ReactNode;
  iconSize?: number;
  disabled?: boolean;
}) {
  return (
    <button className="button primary" disabled={busy || disabled}>
      {busy ? (
        <Loader2 size={iconSize} className="spin" />
      ) : (
        <Check size={iconSize} />
      )}
      {children}
    </button>
  );
}
