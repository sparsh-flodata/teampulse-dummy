import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui";

/** Full-screen loading state while the workspace snapshot loads. */
export function BootScreen() {
  return (
    <div className="boot">
      <Logo />
      <Loader2 className="spin" size={22} />
      <p>Finding your team's rhythm…</p>
    </div>
  );
}

/** Full-screen error when the workspace cannot load at all. */
export function BootError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="boot">
      <Logo />
      <p>{message}</p>
      <button className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
